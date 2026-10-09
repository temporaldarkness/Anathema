const VOLUME_KEY = 'radio_volume';
const STREAM_URL = '/radio/stream';

class RadioStore {
	private _el = $state<HTMLAudioElement | null>(null);
	private _userStopped = false;

	playing = $state(false);
	reconnecting = $state(false);
	volume = $state(
		typeof localStorage !== 'undefined'
			? Number(localStorage.getItem(VOLUME_KEY) ?? '0.7')
			: 0.7
	);
	now = $state<any>({ status: 'idle' });

	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private lastCurrentTime = 0;
	private lastProgressAt = Date.now();

	attach(el: HTMLAudioElement) {
		this._el = el;
		el.volume = this.volume;
		this._attachEvents(el);
	}

	private _attachEvents(el: HTMLAudioElement) {
		el.addEventListener('ended', () => this.scheduleReconnect(150));
		el.addEventListener('error', () => this.scheduleReconnect(400));
		el.addEventListener('stalled', () => this.scheduleReconnect(800));
		el.addEventListener('playing', () => {
			this.lastProgressAt = Date.now();
		});

		setInterval(() => {
			if (this._userStopped || !this._el) return;
			const t = this._el.currentTime;
			if (t > this.lastCurrentTime) {
				this.lastCurrentTime = t;
				this.lastProgressAt = Date.now();
			} else if (Date.now() - this.lastProgressAt > 2500) {
				this._scheduleReconnect(150);
			}
		}, 1200);
	}

	private _buildStreamUrl() {
		return `${STREAM_URL}?_=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	}

	private _cancelReconnect() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}
	
	private async _tryPlay() {
		const el = this._el;
		if (!el || this._userStopped) return;

		this._cancelReconnect();
		this.reconnecting = true;
		try {
			el.pause();
			el.removeAttribute('src');
			el.load();
			await new Promise((r) => setTimeout(r, 120));

			el.src = this._buildStreamUrl();
			el.load();
			await el.play();

			this.lastProgressAt = Date.now();
			this.lastCurrentTime = 0;
			this.playing = true;
		} catch (e) {
			console.warn('stream start failed, will retry', e);
		} finally {
			this.reconnecting = false;
		}
	}

	async start() {
		this._userStopped = false;
		this.playing = true;
		await this._tryPlay();
	}

	stop() {
		this._userStopped = true;
		this._cancelReconnect();
		const el = this._el;
		if (el) {
			el.pause();
			el.removeAttribute('src');
			el.load();
		}
		this.playing = false;
	}

	toggle() {
		if (this._userStopped) this.start();
		else this.stop();
	}

		private _scheduleReconnect(delay = 300) {
		if (this._userStopped) return;
		if (this.reconnecting) return;
		if (this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this._tryPlay();
		}, delay);
	}

	setVolume(v: number) {
		this.volume = v;
		if (this._el) this._el.volume = v;
		try {
			localStorage.setItem(VOLUME_KEY, String(v));
		} catch {}
	}

	async refreshNow() {
		try {
			const r = await fetch('/api/radio/now');
			if (r.ok) this.now = await r.json();
		} catch {}
	}
}

export const radio = new RadioStore();