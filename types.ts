
export interface HabiticaTasksSettings {
	userId: string; // Habitica User ID
	timeOut: number; // in milliseconds
	apiKey: string; // Habitica API Key
	rateLimitBuffer: number; // Optional additional buffer for rate limiting
	habiticaFolderPath: string; // Optional folder path for Habitica tasks
	globalTaskTag?: string; // Optional global tag for all Habitica tasks
	indentString: string
}

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

export const TaskTypes = {
	habits: 'habits',
	dailys: 'dailys',
	todos: 'todos',
	rewards: 'rewards',
	completedTodos: 'completedTodos'
} as const;
export type TaskType = typeof TaskTypes[keyof typeof TaskTypes];
export type HabiticaTaskMap = {
	[key in TaskType]: HabiticaTask[];
}
export const ExcludedTaskTypes: Set<TaskType> = new Set(['completedTodos', 'rewards']);



export type HabiticaResponse = {
	success: boolean;
	data: HabiticaTask[] | HabiticaTask;
}


export interface HabiticaTaskRequest {
	type?: TaskType;
	dueDate?: Date;
}
