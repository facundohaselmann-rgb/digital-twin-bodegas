import { render } from 'preact';
import { App } from './ui/App';
import { getLang } from './i18n';
import './styles.css';

document.documentElement.lang = getLang();
render(<App />, document.getElementById('app')!);
