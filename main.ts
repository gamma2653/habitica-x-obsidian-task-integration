import type { App } from 'obsidian';
import { Notice, Plugin, PluginSettingTab, Setting, MarkdownView } from 'obsidian';


interface HabiticaTasksSettings {
	userId: string; // Habitica User ID
	timeOut: number; // in milliseconds
	apiKey: string; // Habitica API Key
	rateLimitBuffer: number; // Optional additional buffer for rate limiting

}

type HabiticaTask = {
	attribute: string
	byHabitica: boolean
	challenge: {
		id?: string
		shortName?: string
		taskId?: string
	}
	checklist?: object
	collapseChecklist?: boolean
	completed?: boolean
	counterDown?: number
	counterUp?: number
	createdAt: string
	date?: any
	daysOfMonth?: object
	down?: boolean
	everyX?: number
	frequency?: string
	group: {
		approval?: object
		assignedUsers: object
		completedBy?: object
		sharedCompletion?: string
	}
	history?: object
	id: string
	isDue?: boolean
	nextDue?: object
	notes: string
	priority: number
	reminders: object
	repeat?: object
	startDate?: string
	steak?: number
	tags: string[]
	text: string
	type: string
	up?: boolean
	updatedAt: string
	userId: string
	value: number
	weeksOfMonth?: object
	yesterDaily?: boolean
	_id: string
}


const DEFAULT_SETTINGS: HabiticaTasksSettings = {
	userId: '',
	timeOut: 30000,
	apiKey: '',
	rateLimitBuffer: 10000 // 10 second buffer
}

const HABITICA_SIDE_PLUGIN_ID = 'habitica-x-obsidian-task-integration';
const PLUGIN_NAME = 'Habitica-Tasks Integration';
const HABITICA_API_URL = 'https://habitica.com/api';
const DEVELOPER_USER_ID = 'a8e40d27-c872-493f-acf2-9fe75c56ac0c'
// Itssa me!


type HabiticaTaskResponse = {
	success: boolean;
	data: HabiticaTask[];
}
type TaskType = 'habits' | 'dailys' | 'todos' | 'rewards' | 'completedTodos'


interface HabiticaTaskRequest {
	type?: TaskType;
	dueDate?: Date;
}

// Utility function for debugging: reveals the API structure for logging the types of keys in the response objects
/**
 * Reveals the types of keys in an object.
 * @param obj The object to analyze.
 * @returns A record mapping keys to their types.
 */
const _revealObjectKeyTypes = (obj: object): Record<string, string> => {
	const keyTypes: Record<string, string> = {};
	for (const [key, value] of Object.entries(obj)) {
		keyTypes[key] = typeof value;
	}
	return keyTypes;
}

/**
 * Coalesces the key types from multiple objects.
 * If a key has different types across objects, it is marked as 'any'.
 * If a key is not present in all objects, it is marked as optional (i.e., type | undefined).
 * @param objects An array of records mapping keys to their types.
 * @returns A record mapping keys to their coalesced types.
 */
const _coalesceObjectKeyTypes = (objects: Record<string, string>[]): Record<string, string> => {
	const coalesced: Record<string, string> = {};
	const keyCounts: Record<string, number> = {};
	for (const obj of objects) {
		for (const [key, type] of Object.entries(obj)) {
			keyCounts[key] = (keyCounts[key] || 0) + 1;
			if (coalesced[key]) {
				if (coalesced[key] !== type) {
					coalesced[key] = 'any';
				}
			} else {
				coalesced[key] = type;
			}
		}
	}
	// Mark keys that are not present in all objects as optional (i.e., type | undefined)
	for (const key of Object.keys(coalesced)) {
		if (keyCounts[key] < objects.length) {
			coalesced[key] = `${coalesced[key]} | undefined`;
		}
	}
	return coalesced;
}

/**
 * Interfaces with the Habitica API while respecting rate limits.
 */
class HabiticaClient {
	plugin: HabiticaTasksIntegration;
	remainingRequests: number = 30;
	nextResetTime: Date | null = null;
	constructor(plugin: HabiticaTasksIntegration) {
		// Initialize with settings
		this.plugin = plugin;

	}

	settings() {
		return this.plugin.settings;
	}

	buildApiUrl(endpoint: string, version: number = 3, queryParams: Record<string, string> = {}): string {
		const queryString = new URLSearchParams(queryParams).toString();
		return `${HABITICA_API_URL}/v${version}/${endpoint}?${queryString}`;
	}

	_defaultHeaders() {
		return {
			'x-client': `${DEVELOPER_USER_ID}-${HABITICA_SIDE_PLUGIN_ID}`,
			'x-api-user': `${this.settings().userId}`,
			'x-api-key': `${this.settings().apiKey}`
		};
	}

	async callWhenRateLimitAllows<T>(fn: () => Promise<T>): Promise<T> {
		// If we have remaining requests, call the function immediately
		if (this.remainingRequests > 0) {
			console.log("callWhenRateLimitAllows: Remaining requests available, calling function immediately.");
			return fn();
		}
		// If we don't have remaining requests, wait until the reset time and resolve then.
		if (this.nextResetTime && this.nextResetTime > new Date()) {
			console.log(`callWhenRateLimitAllows: No remaining requests, waiting until reset time at ${this.nextResetTime.toISOString()} (${this.nextResetTime}).`);
			const waitTime = this.nextResetTime.getTime() - new Date().getTime();
			return new Promise((resolve) => {
				setTimeout(() => {
					resolve(fn());
				}, waitTime + this.settings().rateLimitBuffer);
			});
		}
		console.log("!!! callWhenRateLimitAllows: No reset time available, calling function immediately.");
		// If we don't have a reset time, just call the function (shouldn't happen)
		return fn();
	}

	async _handleResponse<T>(response: Response): Promise<T> {
		// Check response headers for rate limiting info
		this.remainingRequests = parseInt(response.headers.get('x-ratelimit-remaining') || '30');
		this.nextResetTime = new Date(response.headers.get('x-ratelimit-reset') || '');
		console.log(`Rate Limit - Remaining: ${this.remainingRequests}, Next Reset Time: ${this.nextResetTime}`);
		return response.json() as Promise<T>;
	}

	async retrieveTasks(ctx: HabiticaTaskRequest = {}): Promise<HabiticaTask[]> {
		// Fetch
		// Only include keys for non-null/defined parameters
		const queryParams: Record<string, string> = {
			...(ctx.type ? { type: ctx.type } : {}),
			...(ctx.dueDate ? { dueDate: ctx.dueDate.toISOString() } : {})
		};
		const url = this.buildApiUrl('tasks/user', 3, queryParams);
		const headers = this._defaultHeaders();
		console.log(`Fetching tasks from Habitica: ${url}`);
		console.log(`Using headers: ${JSON.stringify(headers)}`);
		// First retrieve data, then parse response
		return this.callWhenRateLimitAllows(() =>
			fetch(url, { headers }).then(response => this._handleResponse<HabiticaTaskResponse>(response))
		).then((data: HabiticaTaskResponse) => {
			if (data.success) {
				new Notice(`Retrieved ${data.data.length} ${ctx.type} tasks from Habitica.`);
				return data.data;
			} else {
				new Notice(`Failed to retrieve tasks from Habitica.`);
				new Notice(`Response: ${JSON.stringify(data)}`);
				return [];
			}
		});
	}
}

/**
 * Main plugin class for Habitica-Tasks Integration.
 * 
 * Handles plugin lifecycle, settings, and UI integration.
 */
export default class HabiticaTasksIntegration extends Plugin {
	settings: HabiticaTasksSettings;
	client: HabiticaClient;

	attachRibbonButton() {
		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('swords', PLUGIN_NAME, async (_evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice(`${PLUGIN_NAME} icon clicked. Retrieving tasks...`);
			const tasks = await this.client.retrieveTasks({ type: 'dailys' });
			console.log('Retrieved tasks:', tasks);
			// print `task: <typeof task>` for each task
			if (tasks.length > 0) {
				new Notice(`Retrieved ${tasks.length} tasks from Habitica.`);
				// Print all task text and tags to console
				// tasks.forEach((task) => {
				// 	console.log(`Task: ${task.text}, Tags: ${task.tags}, Type: ${task.type}`);
				// });
			} else {
				new Notice('No tasks retrieved from Habitica.');
			}
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('habitica-task-btn');
	}

	attachCommands() {
		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				// new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		// this.addCommand({
		// 	id: 'sample-editor-command',
		// 	name: 'Sample editor command',
		// 	editorCallback: (editor: Editor, _view: MarkdownView) => {
		// 		console.log(editor.getSelection());
		// 		editor.replaceSelection('Sample Editor Command');
		// 	}
		// });
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						// new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});
	}

	attachStatusBar() {
		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');
	}

	/**
	 * This function is called when the plugin is loaded
	 * It is used to register various aspects of the plugin
	 * such as settings, commands, ribbon icons, etc.
	 * 
	 * Throws an error if `this.app.plugins` cannot be accessed.
	 */
	registerInternals() {
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log('click', evt);
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

		// Detect Tasks plugin
		this.app.workspace.onLayoutReady(() => {
			// Access plugins manager via type assertion since it's not in the public API
			try {
				const tasksPlugin: Plugin = (this.app as any).plugins.getPlugin('obsidian-tasks-plugin');
				// You can check if tasksPlugin is loaded and enabled here
				console.log('Tasks plugin:', tasksPlugin);
			} catch (error) {
				throw new Error('Failed to access plugins manager: ' + error);
			}
		});
	}


	async onload() {
		await this.loadSettings();
		this.attachRibbonButton();
		this.attachStatusBar();
		this.attachCommands();
		this.registerInternals();
		this.client = new HabiticaClient(this);
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: HabiticaTasksIntegration;

	constructor(app: App, plugin: HabiticaTasksIntegration) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('User ID')
			.setDesc('Enter your Habitica User ID')
			.addText(text => text
				.setPlaceholder('Enter your Habitica User ID')
				.setValue(this.plugin.settings.userId)
				.onChange(async (value) => {
					this.plugin.settings.userId = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Enter your Habitica API Key')
			.addText(text => text
				.setPlaceholder('Enter your Habitica API Key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Timeout')  // Minimum value is 30000
			.setDesc('Enter timeout in milliseconds')
			.addText(text => text
				.setPlaceholder('Enter timeout in milliseconds')
				.setValue(this.plugin.settings.timeOut.toString())
				.onChange(async (value) => {
					const intValue = parseInt(value);
					if (!isNaN(intValue) && intValue >= 30000) {
						this.plugin.settings.timeOut = intValue;
						await this.plugin.saveSettings();
					} else {
						new Notice('Please enter a valid number greater than or equal to 30000.');
					}
				}));
		new Setting(containerEl)
			.setName('Rate Limit Buffer')  // Minimum value is 0
			.setDesc('Enter additional buffer time in milliseconds for rate limiting')
			.addText(text => text
				.setPlaceholder('Enter buffer time in milliseconds')
				.setValue(this.plugin.settings.rateLimitBuffer.toString())
				.onChange(async (value) => {
					const intValue = parseInt(value);
					if (!isNaN(intValue) && intValue >= 0) {
						this.plugin.settings.rateLimitBuffer = intValue;
						await this.plugin.saveSettings();
					} else {
						new Notice('Please enter a valid number greater than or equal to 0.');
					}
				}));
	}
}
