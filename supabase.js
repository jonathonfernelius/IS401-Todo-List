/* Public browser configuration. Access is restricted by Supabase Auth + RLS. */
window.TidyConfig = {
  url: 'https://mhfvwzfoupeltdccpvmc.supabase.co',
  publishableKey: 'sb_publishable_Hv0sxbRIKwdnxzvY4GHQHQ_kYgB-s4U'
};
window.tidyClient = window.supabase?.createClient(TidyConfig.url, TidyConfig.publishableKey);
