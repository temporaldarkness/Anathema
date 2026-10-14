import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';
import { ProfileModalProvider } from './game/profileModal';
import { ConfirmProvider } from './game/confirmContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/games/aspects">
	  <ProfileModalProvider>
	    <ConfirmProvider>
          <App />
		</ConfirmProvider>
	  </ProfileModalProvider>
    </BrowserRouter>
  </React.StrictMode>,
);