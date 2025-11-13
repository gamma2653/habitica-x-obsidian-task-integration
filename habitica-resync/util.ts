import type { HabiticaTask, HabiticaTaskMap, HabiticaTasksSettings as HabiticaTaskSettings } from './types';
// import { version as VERSION } from './manifest.json';

/**
 * Utility function for debugging.
 * Reveals the API structure for logging the types of keys in the response objects.
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



const VERSION = "";

export const log = (message: string, ...optionalParams: any[]) => {
    console.log(`[Habitica Resync v${VERSION}] ${message}`, ...optionalParams);
}

export const warn = (message: string, ...optionalParams: any[]) => {
    console.warn(`[Habitica Resync v${VERSION}] ${message}`, ...optionalParams);
}

export const error = (message: string, ...optionalParams: any[]) => {
    console.error(`[Habitica Resync v${VERSION}] ${message}`, ...optionalParams);
}

export const organizeHabiticaTasksByType = (tasks: HabiticaTask[]): HabiticaTaskMap => {
    const taskMap: HabiticaTaskMap = {
        habit: [],
        daily: [],
        todo: [],
        reward: [],
        completedTodo: []
    };
    for (const task of tasks) {
        if (task.type in taskMap) {
            taskMap[task.type].push(task);
        } else {
            console.warn(`Unknown task type encountered: ${task.type}`);
        }
    }
    return taskMap;
}


export const checklistLinesForTask = (task: HabiticaTask, settings: HabiticaTaskSettings): string[] => {
    // If checklist is invalid, return empty array
    if (!task.checklist || !Array.isArray(task.checklist) || task.checklist.length === 0) {
        return [];
    }
    // Coalesce checklist items into markdown lines
    const checklistLines: string[] = [];
    for (const item of task.checklist) {
        const completed = item.completed ? '- [x]' : '- [ ]';
        checklistLines.push(`${settings.indentString}${completed} ${item.text}`);
    }
    return checklistLines;
}

const isDue = (task: HabiticaTask): boolean => {
    if (task.type === 'daily') {
        return task.isDue || false;
    }
    if (task.type === 'todo' && task.date) {
        // Check nextDue
        if (task.nextDue) {
            const today = new Date().toISOString().split('T')[0];
            const nextDueDate = new Date(task.nextDue[0]).toISOString().split('T')[0];
            return nextDueDate <= today;
        }
        const today = new Date().toISOString().split('T')[0];
        const taskDate = new Date(task.date).toISOString().split('T')[0];
        return taskDate <= today;
    }
    return false;
};

const taskDueDate = (task: HabiticaTask): string => {
    if (task.type === 'daily') {
        return `📅 ${new Date().toISOString().split('T')[0]}`;
    } else if (task.type === 'todo' && task.date) {
        return `📅 ${new Date(task.date).toISOString().split('T')[0]}`;
    }
    // Check nextDue
    if (task.nextDue && task.nextDue.length > 0) {
        // TODO: Inefficient, optimize later if needed (lots of Date objects created, make them once on parsing response.)
        const earliestDue = task.nextDue.reduce((earliest, current) => {
            return (new Date(current) < new Date(earliest)) ? current : earliest;
        }, task.nextDue[0]);
        return `📅 ${new Date(earliestDue).toISOString().split('T')[0]}`;
    }
    return '';
};

const TASK_PRIORITIES = [
    "⏬",
    "🔽",
    "🔼",
    "⏫"
] as const;
type TaskPriorityEmoji = typeof TASK_PRIORITIES[number];

const priorityToEmoji = (priority: number): string => {
    const intPriority = Math.round(Math.max(0, Math.min(3, priority)));
    return TASK_PRIORITIES[intPriority] || '';
};

export const newSubscriberEntry = () => ({
    paneSync: new Set<(...args: any[]) => void>(),
    noteSync: new Set<(...args: any[]) => void>()
});

export const emojiPartForTask = (task: HabiticaTask, settings: HabiticaTaskSettings): string => {
    // First pick emoji based on task type
    const duePart = taskDueDate(task);
    const priorityPart = priorityToEmoji(task.priority);

    return `${priorityPart} ${duePart}`.trim();
}

/**
 * Generates the primary markdown line for a Habitica task.
 * This line includes the completion checkbox, an emoji representing the task type, and the task text.
 * @param task The Habitica task to convert to a markdown line.
 * @param settings Settings for formatting the task line.
 * @returns The primary markdown line for the task.
 */
export const primaryLineForTask = (task: HabiticaTask, settings: HabiticaTaskSettings): string => {
    const completed = task.completed ? '- [x]' : '- [ ]';
    const emojiPart = emojiPartForTask(task, settings);
    const tagPart = settings.globalTaskTag ? `${settings.globalTaskTag}` : '';
    return `${completed} ${tagPart} ${task.text} ${emojiPart}`;
}

/**
 * Converts a Habitica task to a markdown note.
 * @param task The Habitica task to convert.
 * @param settings Settings for formatting the task note.
 * @returns The markdown-formatted string for the task.
 */
export const taskToNoteLines = (task: HabiticaTask, settings: HabiticaTaskSettings): string => {
    return [primaryLineForTask(task, settings), ...checklistLinesForTask(task, settings)].join('\n');
}
