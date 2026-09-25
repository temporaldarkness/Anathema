import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [tailwindcss(), sveltekit()],
    server: {
        proxy: {
			'/auth': {
				target: 'http://localhost:8000',
				changeOrigin: true,
			},
			'/api': {
				target: 'http://localhost:8000',
				changeOrigin: true,
			},
		}
    }
});
