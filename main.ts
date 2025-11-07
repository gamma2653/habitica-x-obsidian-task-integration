import type { App } from 'obsidian';
import { Notice, Editor, Plugin, PluginSettingTab, Setting, MarkdownView, TFolder } from 'obsidian';
import type { HabiticaTasksSettings, HabiticaTaskRequest, HabiticaTask, HabiticaResponse, HabiticaTaskMap, TaskType } from './types';
import { ExcludedTaskTypes } from './types';
import { organizeHabiticaTasksByType, taskToNoteLines } from './util';


const DEFAULT_SETTINGS: HabiticaTasksSettings = {
	userId: '',
	timeOut: 30000,
	apiKey: '',
	rateLimitBuffer: 10000, // 10 second buffer
	habiticaFolderPath: 'HabiticaTasks',
	indentString: '    '
}

const HABITICA_SIDE_PLUGIN_ID = 'habitica-x-obsidian-task-integration';
const PLUGIN_NAME = 'Habitica-Tasks Integration';
const HABITICA_API_URL = 'https://habitica.com/api';
const DEVELOPER_USER_ID = 'a8e40d27-c872-493f-acf2-9fe75c56ac0c'  // Itssa me, GammaThought!


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

	/**
	 * Serves as a local router for building Habitica API URLs.
	 * @param endpoint The API endpoint to access.
	 * @param version The API version to use.
	 * @param queryParams The query parameters to include in the URL.
	 * @returns The constructed API URL.
	 */
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
	_defaultJSONHeaders() {
		return {
			...this._defaultHeaders(),
			'Content-Type': 'application/json'
		};
	}

	/**
	 * Calls the provided function when the rate limit allows it.
	 * If there are remaining requests, it calls the function immediately.
	 * If there are no remaining requests, it waits until the next reset time plus a buffer before calling the function.
	 * @param fn The function to call when the rate limit allows it.
	 * @returns A promise that resolves to the result of the function.
	 */
	async callWhenRateLimitAllows(fn: () => Promise<Response>): Promise<HabiticaResponse> {
		// If we have remaining requests, call the function immediately
		if (this.remainingRequests > 0) {
			console.log("callWhenRateLimitAllows: Remaining requests available, calling function immediately.");
			return fn().then(this._handleResponse.bind(this));
		}
		// If we don't have remaining requests, wait until the reset time and resolve then.
		if (this.nextResetTime && this.nextResetTime > new Date()) {
			console.log(`callWhenRateLimitAllows: No remaining requests, waiting until reset time at ${this.nextResetTime.toISOString()} (${this.nextResetTime}).`);
			const waitTime = this.nextResetTime.getTime() - new Date().getTime();
			return new Promise<HabiticaResponse>((resolve) => {
				setTimeout(() => {
					// Recursively call this function after waiting to ensure rate limit is respected
					this.callWhenRateLimitAllows(fn).then(resolve);
				}, waitTime + this.settings().rateLimitBuffer);
			});
		}
		console.log("!!! callWhenRateLimitAllows: No reset time available, calling function immediately.");
		// If we don't have a reset time, just call the function (shouldn't happen, except maybe on first call)
		return fn().then(this._handleResponse.bind(this));
	}

	async _handleResponse(response: Response): Promise<HabiticaResponse> {
		// Check response headers for rate limiting info
		console.log(`this: `, this);
		this.remainingRequests = parseInt(response.headers.get('x-ratelimit-remaining') || '30');
		this.nextResetTime = new Date(response.headers.get('x-ratelimit-reset') || '');
		console.log(`Rate Limit - Remaining: ${this.remainingRequests}, Next Reset Time: ${this.nextResetTime}`);
		// Check if response is ok & successful
		if (!response.ok) {
			throw new Error(`HTTP error (Is Habitica API down?); status: ${response.status}, statusText: ${response.statusText}`);
		}
		// Sneak peek at the response JSON
		const data = await response.json() as HabiticaResponse;
		if (!data.success) {
			throw new Error(`Habitica API error (Was there a Habitica API update?); response: ${JSON.stringify(data)}`);
		}
		return data;
	}

	/**
	 * Retrieves tasks from Habitica API based on the provided context.
	 * If no context is provided, retrieves all tasks.
	 * If the request fails, notifies the user and returns an empty array.
	 * @param ctx The context for retrieving tasks, including type and due date.
	 * @returns A promise that resolves to an array of HabiticaTask objects.
	 */
	async retrieveTasks(ctx: HabiticaTaskRequest = {}): Promise<HabiticaTask[]> {
		// Fetch
		// Only include keys for non-null/defined parameters
		const queryParams: Record<string, string> = {
			...(ctx.type ? { type: ctx.type } : {}),
			...(ctx.dueDate ? { dueDate: ctx.dueDate.toISOString() } : {})
		};
		const url = this.buildApiUrl('tasks/user', 3, queryParams);
		const headers = this._defaultJSONHeaders();
		console.log(`Fetching tasks from Habitica: ${url}`);

		// First retrieve data, then parse response
		return this.callWhenRateLimitAllows(() =>
			fetch(url, { method: 'GET', headers })
		).then((data: HabiticaResponse) => {
			// Presume failure is caught by _handleResponse
			return data.data as HabiticaTask[];
		});
	}

	/**
	 * Utility method to retrieve all tasks organized by type.
	 * @returns A promise that resolves to a map of tasks organized by type.
	 */
	async retrieveAllTasks(): Promise<HabiticaTaskMap> {
		// Retrieve all tasks of all types
		const tasks = await this.retrieveTasks();
		return organizeHabiticaTasksByType(tasks);
	}

	// async createTask(task: Partial<HabiticaTask>): Promise<HabiticaTask | null> {
	// 	// Create a new task in Habitica
	// 	const url = this.buildApiUrl('tasks/user', 3);
	// 	const headers = this._defaultJSONHeaders();
	// 	console.log(`Creating task in Habitica: ${url}`);

	// 	return this.callWhenRateLimitAllows(() =>
	// 		fetch(url, { method: 'POST', headers, body: JSON.stringify(task) })
	// 	).then((data: HabiticaResponse) => {
	// 		// Presume failure is caught by _handleResponse
	// 		return data.data as HabiticaTask;
	// 	});
	// }
}

/**
 * Main plugin class for Habitica-Tasks Integration.
 * 
 * Handles plugin lifecycle, settings, and UI integration.
 */
export default class HabiticaTasksIntegration extends Plugin {
	settings: HabiticaTasksSettings;
	client: HabiticaClient;
	functioning: boolean = true;
	nonFunctionalReason: string = '';


	attachRibbonButton() {
		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('swords', PLUGIN_NAME, async (_evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice(`${PLUGIN_NAME} icon clicked. Retrieving tasks...`);
			this.client.retrieveAllTasks().then(
				async (taskMap: HabiticaTaskMap) => {
					console.log('Retrieved all tasks organized by type:', taskMap);
					const folderPath = this.getOrCreateHabiticaFolder();
					await this.createHabiticaNotes();
					console.log('Folder path:', folderPath);
					// Process the taskMap as needed
					new Notice(`Retrieved tasks organized by type. Check ${folderPath} for files.`);
				}
			).catch(async (error) => {
				console.error('Error retrieving tasks from Habitica:', error);
				new Notice(`Error retrieving tasks from Habitica: ${error.message}`);
			});
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('habitica-task-btn');
	}

	runOrNotify<T extends (...args: any[]) => any>(fn: T): T {  // Actually fair use of 'any' here
		const plugin = this;
		return function(this: any, ...args: Parameters<T>): ReturnType<T> | void {
			if (!plugin.functioning) {
				console.warn(`Plugin is not functioning: ${plugin.nonFunctionalReason}`);
				new Notice(`${PLUGIN_NAME} is not functioning properly. Please check the console for errors.`);
				return;
			}
			return fn.apply(this, args);
		} as T;
	}

	async createHabiticaNotes() {
		const folderPath = this.getOrCreateHabiticaFolder();
		// Create files
		const habiticaTasks = await this.client.retrieveAllTasks();
		for (const [type, tasks] of Object.entries(habiticaTasks)) {
			// Skip ignored types
			if (tasks.length === 0 || ExcludedTaskTypes.has(type as TaskType)) {  // Surprised TypeScript allows this cast
				continue;
			}
			const fileName = `${type}.md`;
			const filePath = `${folderPath}/${fileName}`;
			const file = this.app.vault.getFileByPath(filePath);
			if (!file) {
				await this.app.vault.create(filePath, tasks.map(task => taskToNoteLines(task, this.settings)).join('\n\n---\n\n'));
			} else {
				await this.app.vault.modify(file, tasks.map(task => taskToNoteLines(task, this.settings)).join('\n\n---\n\n'));
			}
		}
	}

	getOrCreateHabiticaFolder() {
		const folderPath = this.settings.habiticaFolderPath;
		let folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (folder && !(folder instanceof TFolder)) {
			// If the path exists but is not a folder, throw an error
			throw new Error(`Path ${folderPath} exists but is not a folder. Please remove or rename the file to restore functionality of this plugin.`);
		}
		if (!folder) {
			// If the folder doesn't exist, create it
			this.app.vault.createFolder(folderPath);
		}
		return folderPath;
	}

	attachCommands() {
		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: this.runOrNotify(() => {
				// new SampleModal(this.app).open();
			})
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: this.runOrNotify((editor: Editor, _view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			})
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: this.runOrNotify((checking: boolean) => {
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
			})
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
		this.addSettingTab(new HabiticaTasksSettingTab(this.app, this));

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
		this.getOrCreateHabiticaFolder();
	}
}

class HabiticaTasksSettingTab extends PluginSettingTab {
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
					if (!isNaN(intValue) && intValue >= 1000) {
						this.plugin.settings.rateLimitBuffer = intValue;
						await this.plugin.saveSettings();
					} else {
						new Notice('Please enter a valid number greater than or equal to 1000.');
					}
				}));
		new Setting(containerEl)
			.setName('Habitica Folder Path')
			.setDesc('Enter the folder path where Habitica tasks will be stored')
			.addText(text => text
				.setPlaceholder('Enter folder path')
				.setValue(this.plugin.settings.habiticaFolderPath)
				.onChange(async (value) => {
					this.plugin.settings.habiticaFolderPath = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Global Task Tag')
			.setDesc('Enter a global tag to be added to all Habitica tasks (optional)\nIf using Obsidian Tasks plugin, this should match the "Global task filter" setting.')
			.addText(text => text
				.setPlaceholder('Enter global task tag')
				.setValue(this.plugin.settings.globalTaskTag || '')
				.onChange(async (value) => {
					value = value.trim();
					this.plugin.settings.globalTaskTag = (value === '' ? undefined : value);
					await this.plugin.saveSettings();
				}));

	}
}
