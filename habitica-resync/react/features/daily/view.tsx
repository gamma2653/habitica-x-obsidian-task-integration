import { useHabiticaResyncApp, SUBSCRIBER_ID } from "../../ctx";
import { useEffect, useState } from "react";
import { HabiticaTask } from "habitica-resync/types";

export const EVENT_ID = 'dailyUpdated';

export const DailyView = () => {
    const { app, habiticaClient } = useHabiticaResyncApp();
    const { vault } = app;
    const [tasks, setTasks] = useState<HabiticaTask[]>([]);
    
    useEffect(() => {
        habiticaClient.subscribe(EVENT_ID, SUBSCRIBER_ID, (dailys) => {
            setTasks(dailys);
        });
    }, []);  // empty dependency for only subscribing once

    return (
        <div>
            <h2>Dailys View</h2>
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
