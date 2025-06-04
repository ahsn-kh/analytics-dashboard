// lib/supabase.ts
'use client'; // This directive is crucial for client-side components.

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export const supabase = createClientComponentClient();