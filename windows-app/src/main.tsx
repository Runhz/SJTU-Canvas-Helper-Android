import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@radix-ui/themes';
import { DesktopApp } from './DesktopApp';
import '@radix-ui/themes/styles.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><Theme appearance="light" accentColor="indigo" grayColor="slate" radius="large" scaling="100%"><DesktopApp /></Theme></StrictMode>);
