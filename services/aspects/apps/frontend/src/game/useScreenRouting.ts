import { useCallback, useEffect, useState } from 'react';
import type { Screen } from '../App';

const BASE_PATH = '/games/aspects';

function stripBase(path: string): string {
  if (path === BASE_PATH) return '/';
  if (path.startsWith(BASE_PATH + '/')) return path.slice(BASE_PATH.length);
  return path;
}

function pathToScreen(path: string, search: string): Screen {
  const clean = stripBase(path);
  const parts = clean.replace(/^\//, '').split('/').filter(Boolean);
  const first = parts[0] ?? '';
  const second = parts[1];
  const params = new URLSearchParams(search);

  switch (first) {
    case '':
      return { kind: 'profile' };
    case 'setup':
      return { kind: 'setup' };
    case 'playing':
      return { kind: 'playing' };
    case 'decks': {
      if (!second) return { kind: 'decks' };
      if (second === 'new') return { kind: 'deck-editor', deckId: null };
      return { kind: 'deck-editor', deckId: second };
    }
    case 'history':
      return { kind: 'history' };
    case 'replay':
      return second ? { kind: 'replay', matchId: second } : { kind: 'history' };
    case 'online': {
      if (!second) {
        const join = params.get('join');
        return { kind: 'online-lobby', joinCode: join ?? undefined };
      }
      const spectator = params.get('spectator') === '1';
      return {
        kind: 'online-game',
        roomCode: second.toUpperCase(),
        role: spectator ? 'spectator' : 'player',
      };
    }
    case 'matchmaking':
      return { kind: 'matchmaking' };
    case 'users':
      return second
        ? { kind: 'user-profile', userId: second }
        : { kind: 'users-search' };
    case 'leaderboard':
      return { kind: 'leaderboard' };
    case 'friends':
      return { kind: 'friends' };
    default:
      return { kind: 'profile' };
  }
}

function screenToPath(s: Screen): string {
  switch (s.kind) {
    case 'profile': return '/';
    case 'setup': return '/setup';
    case 'playing': return '/playing';
    case 'decks': return '/decks';
    case 'deck-editor':
      return s.deckId ? `/decks/${s.deckId}` : '/decks/new';
    case 'history': return '/history';
    case 'replay': return `/replay/${s.matchId}`;
    case 'online-lobby':
      return s.joinCode ? `/online?join=${s.joinCode.toUpperCase()}` : '/online';
    case 'online-game':
      return s.role === 'spectator'
        ? `/online/${s.roomCode}?spectator=1`
        : `/online/${s.roomCode}`;
    case 'matchmaking': return '/matchmaking';
    case 'users-search': return '/users';
    case 'leaderboard': return '/leaderboard';
    case 'user-profile': return `/users/${s.userId}`;
    case 'friends': return '/friends';
  }
}

export function useScreenRouting(): [Screen, (s: Screen) => void] {
  const [screen, setScreenState] = useState<Screen>(() =>
    pathToScreen(window.location.pathname, window.location.search),
  );

  const setScreen = useCallback((s: Screen) => {
    setScreenState(s);
    const next = BASE_PATH + screenToPath(s);
    const current = window.location.pathname + window.location.search;
    if (current !== next) {
      window.history.pushState(null, '', next);
    }
  }, []);

  useEffect(() => {
    const onPop = () => {
      setScreenState(
        pathToScreen(window.location.pathname, window.location.search),
      );
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return [screen, setScreen];
}