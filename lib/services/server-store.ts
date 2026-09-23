import 'server-only';
import { createStore } from './store';
import { createServiceClient } from '@/lib/supabase/server';

// Only authorized server routes may use this store; browser reads use session RLS.
export const serverStore = createStore(createServiceClient);
