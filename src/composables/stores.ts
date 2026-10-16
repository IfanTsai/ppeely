// Connects the core library's data stores to Vue's reactivity system: when a store changes, the corresponding ref is updated.
import { onUnmounted, shallowRef, type ShallowRef } from 'vue';
import { getCustomFonts, subscribeFonts } from '../lib/fonts';
import { getPack, getPacks, subscribePacks } from '../lib/packs';
import { getSettings, subscribeSettings } from '../lib/settings';

function useStore<T>(subscribe: (listener: () => void) => () => void, read: () => T): ShallowRef<T> {
  const state = shallowRef(read());
  const unsubscribe = subscribe(() => {
    state.value = read();
  });
  onUnmounted(unsubscribe);

  return state;
}

export const usePacks = () => useStore(subscribePacks, getPacks);

export const usePack = (id: string) => useStore(subscribePacks, () => getPack(id));

export const useSettings = () => useStore(subscribeSettings, getSettings);

export const useCustomFonts = () => useStore(subscribeFonts, getCustomFonts);
