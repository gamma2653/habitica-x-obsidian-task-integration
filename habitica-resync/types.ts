
export interface HabiticaTasksSettings {
	userId: string; // Habitica User ID
	timeOut: number; // in milliseconds
	apiKey: string; // Habitica API Key
	rateLimitBuffer: number; // Optional additional buffer for rate limiting
	habiticaFolderPath: string; // Optional folder path for Habitica tasks
	globalTaskTag?: string; // Optional global tag for all Habitica tasks
	indentString: string
	enableNotes: boolean; // Whether to enable notes syncing
	enablePane: boolean; // Whether to enable the Habitica pane in Obsidian
}

// TODO: Use zod to validate response data
export type HabiticaTask = {
	attribute: string
	byHabitica: boolean
	challenge: {
		id?: string
		shortName?: string
		taskId?: string
	}
	checklist?: {
		completed: boolean
		id: string
		text: string
	}
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
	nextDue?: string[]
	notes: string
	priority: number
	reminders: object
	repeat?: object
	startDate?: string
	steak?: number
	tags: string[]
	text: string
	type: TaskType
	up?: boolean
	updatedAt: string
	userId: string
	value: number
	weeksOfMonth?: object
	yesterDaily?: boolean
	_id: string
}

export const TASK_TYPES = ['habit', 'daily', 'todo', 'reward', 'completedTodo'] as const;
// export type TaskType = typeof TaskTypes[keyof typeof TaskTypes];
export type TaskType = typeof TASK_TYPES[number];
export type HabiticaTaskMap = {
	[key in TaskType]: HabiticaTask[];
}
export const EXCLUDED_TASK_TYPES: Set<TaskType> = new Set(['completedTodo', 'reward']);

export type HabiticaResponse = {
	success: boolean;
	data: HabiticaTask[] | HabiticaTask;
}

export interface HabiticaTaskRequest {
	type?: TaskType;
	dueDate?: Date;
}

// Event and Subscriber IDs
export const HABITICA_API_EVENTS = ['todoUpdated', 'dailyUpdated', 'habitUpdated', 'taskUpdated'] as const;
export const SUBSCRIBER_IDs = ['paneSync', 'noteSync'] as const;

export type HabiticaApiEvent = typeof HABITICA_API_EVENTS[number];
export type SubscriberID = typeof SUBSCRIBER_IDs[number];

// Habitica API Interface
export interface HabiticaAPI {
	retrieveTasks(ctx?: HabiticaTaskRequest): Promise<HabiticaTask[]>;
	retrieveAllTasks(): Promise<HabiticaTaskMap>;
	// createTask(task: Partial<HabiticaTask>): Promise<HabiticaTask | null>;
	subscribe(event: HabiticaApiEvent, subscriber_id: SubscriberID, listener: (tasks: HabiticaTask[]) => void): void;  // e.g., 'todoUpdated', 'dailyUpdated', etc.
	unsubscribe(event: HabiticaApiEvent, subscriber_id: SubscriberID, listener: (tasks: HabiticaTask[]) => void): void;
	emit(event: HabiticaApiEvent, tasks: HabiticaTask[]): void;
}


// export interface ContextView {
// 	new (leaf: any, ctx: any): ContextView;
// }
