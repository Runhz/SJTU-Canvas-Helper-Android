import './compat';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import {ErrorBoundary} from './ErrorBoundary';
import './styles.css';
import './adaptive.css';
import './reading.css';
import './experience.css';
import './refined.css';
import './theme.css';
import './mobilePolish.css';
import './studyExperience.css';
import './learningFlow.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);

import './chatFocus.css';
import './controlPolish.css';
