import { useHabiticaResyncApp, SUBSCRIBER_ID } from "../../ctx";
import { useEffect, useState } from "react";
import { HabiticaTask } from "habitica-resync/types";

export const EVENT_ID = 'todoUpdated';

export const TodoView = () => {
    const { app, habiticaClient } = useHabiticaResyncApp();
    const { vault } = app;
    const [tasks, setTasks] = useState<HabiticaTask[]>([]);
    
    useEffect(() => {
        habiticaClient.subscribe(EVENT_ID, SUBSCRIBER_ID, (todo) => {
            setTasks(todo);
        });
    }, []);

    return (
        <div>
            <h2>Todo View</h2>
            <ul>
                {tasks.map(task => (
                    <li key={task.id}><span style={{
                        display: 'inline'
                    }}><input type="checkbox" checked={task.completed} id={task.id} /> <label htmlFor={task.id}>{task.text}</label></span></li>
                ))}
            </ul>
        </div>
    );
}
