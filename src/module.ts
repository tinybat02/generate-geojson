// @ts-ignore
import { PanelPlugin } from '@grafana/ui';
import { MapOptions, defaults } from './types';
import { MainPanel } from './MainPanel';
import { MainEditor } from './MainEditor';

export const plugin = new PanelPlugin<MapOptions>(MainPanel).setDefaults(defaults).setEditor(MainEditor);
