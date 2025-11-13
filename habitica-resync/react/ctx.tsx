import { createContext, useContext } from 'react';
import { App } from 'obsidian';

import { HabiticaClient } from '../api'

export const SUBSCRIBER_ID = 'paneSync'

type HabiticaResyncCtx = {
  app: App;
  habiticaClient: HabiticaClient;
}

export const HabiticaResyncAppCtx = createContext<HabiticaResyncCtx | undefined>(undefined);

export const useHabiticaResyncApp = () => {
  const ctx = useContext(HabiticaResyncAppCtx);
  if (!ctx) {
    throw new Error('useHabiticaResyncApp must be used within a HabiticaResyncAppCtx.Provider');
  }
	return ctx;
};
