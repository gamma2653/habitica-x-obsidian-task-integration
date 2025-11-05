import type { HabiticaTask, HabiticaTaskMap, TaskType } from './types';

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

export const organizeHabiticaTasksByType = (tasks: HabiticaTask[]): HabiticaTaskMap => {
	const taskMap: HabiticaTaskMap = {
		habits: [],
		dailys: [],
		todos: [],
		rewards: [],
		completedTodos: []
	};

	for (const task of tasks) {
		const typeMap: Record<string, TaskType> = {
			habit: 'habits',
			daily: 'dailys',
			todo: 'todos',
			reward: 'rewards'
		};
		const typeKey = typeMap[task.type];
		if (typeKey) {
			taskMap[typeKey].push(task);
		} else {
			console.warn(`Unknown task type: ${task.type}`);
		}
	}
	return taskMap;
}
