export const SHARED_SECTIONS = ['dashboard', 'daily', 'bills', 'members', 'payments', 'manage', 'activity'];

export const sharedSection = (search) => {
  const section = new URLSearchParams(search).get('section');
  return SHARED_SECTIONS.includes(section) ? section : 'dashboard';
};

export const sharedSectionSearch = (search, section) => {
  const params = new URLSearchParams(search);
  if (section === 'dashboard') params.delete('section');
  else params.set('section', section);
  const value = params.toString();
  return value ? `?${value}` : '';
};
