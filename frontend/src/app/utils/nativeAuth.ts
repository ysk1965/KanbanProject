import { isNative } from './platform';

export async function nativeGoogleLogin(): Promise<{ idToken: string }> {
  if (!isNative()) {
    throw new Error('nativeGoogleLogin is only available on native platforms');
  }

  const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
  const user = await GoogleAuth.signIn();

  if (!user.authentication.idToken) {
    throw new Error('No ID token received from Google Sign-In');
  }

  return { idToken: user.authentication.idToken };
}

export async function nativeGoogleSignOut(): Promise<void> {
  if (!isNative()) return;

  const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
  await GoogleAuth.signOut();
}
