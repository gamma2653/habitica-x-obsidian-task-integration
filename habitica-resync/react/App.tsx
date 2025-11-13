// import { useHabiticaResyncApp, SUBSCRIBER_ID } from "./ctx";
import { HabitView } from "./features/habit/view";
import { DailyView } from "./features/daily/view";
import { TodoView } from "./features/todo/view";
import { NavBar } from "./features/nav";

export const HabiticaResyncApp = () => {
  // const { app, habiticaClient } = useHabiticaResyncApp();
  // const { vault } = app;

  return (
    <div>
      <h3>Habitica Resync</h3>
      <NavBar tabs={[['Habits', 'habit'], ['Dailys', 'daily'], ['Todos', 'todo']]} />
      <HabitView />
      <DailyView />
      <TodoView />
    </div>
  );
};
