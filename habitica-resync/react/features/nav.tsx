import { useState } from "react";

type NavBarProps = {
    tabs: [string, string][];
}

export const NavBar = ({ tabs }: NavBarProps) => {
    const [activeTab, setActiveTab] = useState<string>('daily');
    return (
        <nav>
            <ul>
                {tabs.map(([label, id]) => (
                    <li key={id} className={activeTab === id ? 'active' : ''}>
                        <button onClick={() => setActiveTab(id)}>
                            {label}
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );
}