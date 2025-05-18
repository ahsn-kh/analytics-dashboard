import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ibymubpldpnzpkytkltt.supabase.co', // 1️⃣ replace this line
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlieW11YnBsZHBuenBreXRrbHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1ODkwNDksImV4cCI6MjA2MzE2NTA0OX0.I-6f4_I7BcTHz_LGIX3_nbU_YH43Vy8wYAR38WtWrVo'                // 2️⃣ replace this line
)

async function insertRow() {
  try {
    const { data, error } = await supabase.from('pageviews').insert({
      site_id: 'demo',
      ref: 'manual'
    });

    if (error) {
      console.error('Error inserting row:', error);
    } else {
      console.log('row inserted');
    }
  } catch (err) {
    console.error('An unexpected error occurred:', err);
  } finally {
    // The original guide had process.exit() here, but let's omit it for now
    // to ensure you see any potential error messages fully before the script ends.
    // If the guide specifically instructs adding it back later, we can do that.
  }
}

insertRow();