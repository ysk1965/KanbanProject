import { isNative } from './platform';

export function initDeepLinks(navigate: (path: string) => void): void {
  if (!isNative()) return;

  import('@capacitor/app').then(({ App }) => {
    App.addListener('appUrlOpen', (event) => {
      try {
        const url = new URL(event.url);
        const path = url.pathname + url.search;

        if (path) {
          navigate(path);
        }
      } catch {
        // Custom scheme URL (bridgespots://path)
        const schemeMatch = event.url.match(/bridgespots:\/\/(.+)/);
        if (schemeMatch) {
          navigate('/' + schemeMatch[1]);
        }
      }
    });

    // Handle app state changes (background -> foreground)
    App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        console.log('[DeepLink] App became active');
      }
    });
  });
}
