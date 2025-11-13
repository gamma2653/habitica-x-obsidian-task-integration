import * as types from './types';
import * as util from './util';
import type HabiticaResyncPlugin from '../main';

const HABITICA_SIDE_PLUGIN_ID = 'habitica-x-obsidian-task-integration';
const HABITICA_API_URL = 'https://habitica.com/api';
const DEVELOPER_USER_ID = 'a8e40d27-c872-493f-acf2-9fe75c56ac0c'  // Itssa me, GammaThought!

/**
 * Interfaces with the Habitica API while respecting rate limits.
 */
export class HabiticaClient implements types.HabiticaAPI {
    plugin: HabiticaResyncPlugin | null = null;
    remainingRequests: number = 30;
    nextResetTime: Date | null = null;
    eventListeners = {
        todoUpdated: util.newSubscriberEntry(),
        dailyUpdated: util.newSubscriberEntry(),
        habitUpdated: util.newSubscriberEntry(),
        taskUpdated: util.newSubscriberEntry()
    };
    constructor(plugin: HabiticaResyncPlugin) {
        // Initialize with settings
        this.plugin = plugin;

    }

    settings() {
        if (!this.plugin) {
            throw new Error('HabiticaClient is not bound to a plugin instance.');
        }
        return this.plugin.settings;
    }

    /**
     * Subscribe to Habitica API events.
     * @param event The event to subscribe to.
     * @param subscriber_id The subscriber ID to use.
     * @param listener The listener function to call when the event is triggered.
     */
    subscribe(event: types.HabiticaApiEvent, subscriber_id: types.SubscriberID, listener: (tasks: types.HabiticaTask[]) => void): void {
        // Subscribe to Habitica API events
        this.eventListeners[event][subscriber_id].add(listener);
    }

    /**
     * Unsubscribe from Habitica API events.
     * @param event The event to unsubscribe from.
     * @param subscriber_id The subscriber ID to use.
     * @param listener The listener function to remove.
     */
    unsubscribe(event: types.HabiticaApiEvent, subscriber_id: types.SubscriberID, listener: (tasks: types.HabiticaTask[]) => void): void {
        // Unsubscribe from Habitica API events
        this.eventListeners[event][subscriber_id].delete(listener);
    }

    emit(event: types.HabiticaApiEvent, tasks: types.HabiticaTask[]): void {
        // Emit Habitica API events
        types.SUBSCRIBER_IDs.forEach((subscriber_id) => {
            this.eventListeners[event][subscriber_id].forEach((listener) => {
                listener(tasks);
            });
        });
    }

    _emitNonHomogeneous(tasks: types.HabiticaTask[]): void {
        new Set(tasks.map(t => t.type)).forEach((updated_type) => {
            const potentialEvent = `${updated_type}Updated`;
            if (potentialEvent in this.eventListeners) {
                this.emit(potentialEvent as types.HabiticaApiEvent, tasks.filter(t => t.type === updated_type));
            }
        });
    }


    /**
     * Perform the callback while unsubscribing from all events, then resubscribe.
     * Useful for performing an operation without triggering event listeners, ie during a bulk sync OR
     * to avoid infinite loops.
     * @param event The event to unsubscribe from.
     * @param subscriber_id The subscriber ID to unsubscribe.
     * @param fn The function to execute while unsubscribed.
     */
    async performWhileUnsubscribed<T>(event: types.HabiticaApiEvent, subscriber_id: types.SubscriberID, awaitable: Promise<T>): Promise<T> {
        // util.log(`event: ${event}, subscriber_id: ${subscriber_id} - Performing while unsubscribed.`);
        const listeners = this.eventListeners[event][subscriber_id];
        listeners.forEach((listener) => {
            this.unsubscribe(event, subscriber_id, listener);
        });
        const result = await awaitable;
        listeners.forEach((listener) => {
            this.subscribe(event, subscriber_id, listener);
        });
        return result;
    }

    async performWhileAllUnsubscribed<T>(subscriber_id: types.SubscriberID, awaitable: Promise<T>): Promise<T> {
        let result = awaitable;

        // Wrap promise w/ performWhileUnsubscribed for all events
        types.HABITICA_API_EVENTS.forEach((event) => {
            result = this.performWhileUnsubscribed(event, subscriber_id, result);
        });
        return result;
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
     * @param awaitable The function to call when the rate limit allows it. This function should return a promise that resolves to a Response.
     * @returns A promise that resolves to the result of the function.
     * @throws An error if the function call fails.
     */
    async callWhenRateLimitAllows(awaitable: Promise<Response>): Promise<types.HabiticaResponse> {
        // If we have remaining requests, call the function immediately
        if (this.remainingRequests > 0) {
            util.log("callWhenRateLimitAllows: Remaining requests available, making request immediately.");
            return awaitable.then(this._handleResponse.bind(this));
        }
        // If we don't have remaining requests, wait until the reset time and resolve then.
        if (this.nextResetTime && this.nextResetTime > new Date()) {
            util.log(`callWhenRateLimitAllows: No remaining requests, waiting until reset time at ${this.nextResetTime.toISOString()} (${this.nextResetTime}).`);
            const waitTime = this.nextResetTime.getTime() - new Date().getTime();
            return new Promise<types.HabiticaResponse>((resolve) => {
                setTimeout(() => {
                    // Recursively call this function after waiting to ensure rate limit is respected
                    this.callWhenRateLimitAllows(awaitable).then(resolve);
                }, waitTime + this.settings().rateLimitBuffer);
            });
        }
        util.log("!!! callWhenRateLimitAllows: No reset time available, making request immediately.");
        // If we don't have a reset time, just call the function (shouldn't happen, except maybe on first call)
        return awaitable.then(this._handleResponse.bind(this));
    }

    /**
     * Handles the response from the Habitica API.
     * @param response The response from the API.
     * @returns A promise that resolves to the parsed HabiticaResponse.
     * @throws An error if the response is not ok or if the API indicates failure.
     */
    async _handleResponse(response: Response): Promise<types.HabiticaResponse> {
        // Check response headers for rate limiting info
        this.remainingRequests = parseInt(response.headers.get('x-ratelimit-remaining') || this.remainingRequests?.toString() || '30');
        this.nextResetTime = new Date(response.headers.get('x-ratelimit-reset') || this.nextResetTime?.toISOString() || new Date().toISOString());
        util.log(`Rate Limit - Remaining: ${this.remainingRequests}, Next Reset Time: ${this.nextResetTime}`);
        // Check if response is ok & successful
        if (!response.ok) {
            throw new Error(`HTTP error (Is Habitica API down?); status: ${response.status}, statusText: ${response.statusText}`);
        }
        // Sneak peek at the response JSON
        const data = await response.json() as types.HabiticaResponse;
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
    async retrieveTasks(ctx: types.HabiticaTaskRequest = {}): Promise<types.HabiticaTask[]> {
        // Fetch
        // Only include keys for non-null/defined parameters
        const queryParams: Record<string, string> = {
            ...(ctx.type ? { type: ctx.type } : {}),
            ...(ctx.dueDate ? { dueDate: ctx.dueDate.toISOString() } : {})
        };
        const url = this.buildApiUrl('tasks/user', 3, queryParams);
        const headers = this._defaultJSONHeaders();
        util.log(`Fetching tasks from Habitica: ${url}`);

        // First retrieve data, then parse response
        return this.callWhenRateLimitAllows(
            fetch(url, { method: 'GET', headers })
        ).then((data: types.HabiticaResponse) => {
            // Presume failure is caught by _handleResponse; cast as appropriate type
            const tasks = data.data as types.HabiticaTask[];
            this._emitNonHomogeneous(tasks);
            return tasks;
        });
    }

    /**
     * Utility method to retrieve all tasks organized by type.
     * @returns A promise that resolves to a map of tasks organized by type.
     */
    async retrieveAllTasks(): Promise<types.HabiticaTaskMap> {
        // Retrieve all tasks of all types
        const tasks = await this.retrieveTasks();
        return util.organizeHabiticaTasksByType(tasks);
    }

    // async createTask(task: Partial<HabiticaTask>): Promise<HabiticaTask | null> {
    // 	// Create a new task in Habitica
    // 	const url = this.buildApiUrl('tasks/user', 3);
    // 	const headers = this._defaultJSONHeaders();
    // 	log(`Creating task in Habitica: ${url}`);

    // 	return this.callWhenRateLimitAllows(() =>
    // 		fetch(url, { method: 'POST', headers, body: JSON.stringify(task) })
    // 	).then((data: HabiticaResponse) => {
    // 		// Presume failure is caught by _handleResponse
    // 		return data.data as HabiticaTask;
    // 	});
    // }
}