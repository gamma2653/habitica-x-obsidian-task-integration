import { StrictMode } from 'react';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { HabiticaResyncApp } from './App';
import { HabiticaResyncAppCtx } from './ctx';
import type { HabiticaClient } from '../api';


export class HabiticaResyncView extends ItemView {
    root: Root | null = null;
	client: HabiticaClient;

	constructor(leaf: WorkspaceLeaf, client: HabiticaClient) {
		super(leaf);
		this.client = client;
	}

	getViewType() {
		return 'HabiticaResyncView';
	}

	getDisplayText() {
		return 'Habitica Resync View';
	}

	async onOpen() {
		this.root = createRoot(this.contentEl);
		this.root.render(
			<StrictMode>
				<HabiticaResyncAppCtx.Provider value={{ app: this.app, habiticaClient: this.client }}>
					<HabiticaResyncApp />
				</HabiticaResyncAppCtx.Provider>
			</StrictMode>
		);
	}

	async onClose() {
		this.root?.unmount();
	}
}
export const VIEW_ID_TO_TYPE: Record<string, new (leaf: WorkspaceLeaf, client: HabiticaClient) => ItemView> = {
	"HabiticaResyncView": HabiticaResyncView
}