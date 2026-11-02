import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: ['selector', '[data-theme]'],
	future: {
		// Touch devices have no hover, so `hover:` styles would stick after a
		// tap. Only apply them where the device actually supports hover.
		hoverOnlyWhenSupported: true
	},
	theme: {
		extend: {
			colors: {
				bg: 'color-mix(in srgb, var(--c-bg) calc(<alpha-value> * 100%), transparent)',
				surface: 'color-mix(in srgb, var(--c-surface) calc(<alpha-value> * 100%), transparent)',
				surface2: 'color-mix(in srgb, var(--c-surface2) calc(<alpha-value> * 100%), transparent)',
				accent: 'color-mix(in srgb, var(--c-accent) calc(<alpha-value> * 100%), transparent)',
				accent2: 'color-mix(in srgb, var(--c-accent2) calc(<alpha-value> * 100%), transparent)',
				ink: 'color-mix(in srgb, var(--c-ink) calc(<alpha-value> * 100%), transparent)',
				muted: 'color-mix(in srgb, var(--c-muted) calc(<alpha-value> * 100%), transparent)',
				line: 'color-mix(in srgb, var(--c-line) calc(<alpha-value> * 100%), transparent)'
			},
			fontFamily: {
				display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
				sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
			},
			boxShadow: {
				glow: '0 0 48px color-mix(in srgb, var(--c-accent) 28%, transparent)',
				'glow-sm': '0 0 24px color-mix(in srgb, var(--c-accent) 22%, transparent)',
				'glow-2': '0 0 24px color-mix(in srgb, var(--c-accent2) 22%, transparent)'
			},
			keyframes: {
				shimmer: {
					'0%': { backgroundPosition: '-200% 0' },
					'100%': { backgroundPosition: '200% 0' }
				},
				pulseGlow: {
					'0%, 100%': { opacity: '0.5' },
					'50%': { opacity: '1' }
				},
				floatY: {
					'0%, 100%': { transform: 'translateY(0px)' },
					'50%': { transform: 'translateY(-10px)' }
				}
			},
			animation: {
				shimmer: 'shimmer 2.4s linear infinite',
				pulseGlow: 'pulseGlow 2.4s ease-in-out infinite',
				floatY: 'floatY 7s ease-in-out infinite'
			}
		}
	},
	plugins: []
} satisfies Config;
