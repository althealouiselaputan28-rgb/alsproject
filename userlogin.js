const DEFAULT_USER_ROLE = 'user';

function getSupabaseClient() {
  const parent = window.parent || window;
  const parentSupabase = parent.supabase || parent.supabaseClient || parent.supabaseInstance || parent.$supabase;
  if (parentSupabase && parentSupabase.auth) {
    return parentSupabase;
  }

  const parentUrl = parent.SUPABASE_URL || parent.VITE_SUPABASE_URL;
  const parentKey = parent.SUPABASE_ANON_KEY || parent.VITE_SUPABASE_ANON_KEY;

  if (window.supabase && typeof window.supabase.createClient === 'function' && parentUrl && parentKey) {
    return window.supabase.createClient(parentUrl, parentKey);
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSupabaseClient(timeoutMs = 2000, intervalMs = 100) {
  const start = Date.now();
  let client = getSupabaseClient();
  while (!client && Date.now() - start < timeoutMs) {
    await sleep(intervalMs);
    client = getSupabaseClient();
  }
  return client;
}

function showMessage(message) {
  alert(message);
}

async function closeParentLoginModal() {
  try {
    const parent = window.parent;
    if (!parent) return;
    const modalEl = parent.document.getElementById('loginSignupModal');
    if (!modalEl) return;
    const modalInstance = parent.bootstrap?.Modal?.getInstance(modalEl);
    if (modalInstance) {
      modalInstance.hide();
      return;
    }
    parent.location.reload();
  } catch (error) {
    console.warn('Unable to close parent modal', error);
  }
}

async function notifyParentAuthUpdate() {
  try {
    if (window.parent && typeof window.parent.updateAuthUI === 'function') {
      window.parent.updateAuthUI();
    }
  } catch (error) {
    console.warn('Unable to notify parent auth update', error);
  }
}

async function createUserProfileRow(supabase, profile) {
  if (!profile?.id) return false;

  try {
    const { error } = await supabase.from('users').insert([profile]);
    if (error) {
      console.warn('Failed to create user profile row', error);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Unexpected error creating user profile row', error);
    return false;
  }
}

async function ensureUserProfileExists(supabase, authUser) {
  if (!authUser?.id) return false;

  try {
    const { data: existing, error: existingError } = await supabase.from('users').select('id').eq('id', authUser.id).maybeSingle();
    if (existingError) {
      console.warn('Error checking existing user profile', existingError);
      return false;
    }

    if (existing) {
      return true;
    }

    const metadata = authUser.user_metadata || {};
    const profile = {
      id: authUser.id,
      email: authUser.email || metadata.email || null,
      full_name: metadata.full_name || metadata.name || '',
      section: metadata.section || '',
      role: metadata.role || DEFAULT_USER_ROLE
    };

    const { error: insertError } = await supabase.from('users').insert([profile]);
    if (insertError) {
      console.warn('Failed to insert profile row', insertError);
      return false;
    }

    return true;
  } catch (error) {
    console.warn('Error ensuring user profile exists', error);
    return false;
  }
}

async function signInWithIdentifier(supabase, identifier, password) {
  return supabase.auth.signInWithPassword({ email: identifier, password });
}

async function handleLogin(supabase) {
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const email = emailInput?.value.trim() || '';
  const password = passwordInput?.value || '';

  if (!email || !password) {
    showMessage('Please enter both email and password.');
    return;
  }

  const { data, error } = await signInWithIdentifier(supabase, email, password);
  if (error) {
    showMessage(`Login failed: ${error.message}`);
    return;
  }

  const authUser = data?.user || data?.session?.user;
  if (authUser) {
    const created = await ensureUserProfileExists(supabase, authUser);
    if (!created) {
      console.warn('User profile creation or verification failed after login.');
    }
  }

  showMessage('Login successful.');
  await notifyParentAuthUpdate();
  await closeParentLoginModal();
}

async function handleSignup(supabase) {
  const emailInput = document.getElementById('signupEmail');
  const fullNameInput = document.getElementById('signupFullName');
  const sectionInput = document.getElementById('signupSection');
  const passwordInput = document.getElementById('signupPassword');
  const email = emailInput?.value.trim() || '';
  const fullName = fullNameInput?.value.trim() || '';
  const section = sectionInput?.value.trim() || '';
  const password = passwordInput?.value || '';

  if (!email || !fullName || !section || !password) {
    showMessage('Please fill out every signup field.');
    return;
  }

  const sectionIdentifier = section.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!sectionIdentifier) {
    showMessage('Section must contain letters or numbers.');
    return;
  }

  const { data: existingSection } = await supabase.from('users').select('id').eq('section', sectionIdentifier).maybeSingle();
  if (existingSection) {
    showMessage('That section is already taken as a login identifier. Try a different section.');
    return;
  }

  const { data: existingEmail } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (existingEmail) {
    showMessage('An account with that email already exists.');
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        section,
        role: DEFAULT_USER_ROLE
      }
    }
  });

  if (error) {
    showMessage(`Signup failed: ${error.message}`);
    return;
  }

  const authUser = data?.user || data?.session?.user;
  const hasSession = !!data?.session;
  let profileCreated = false;

  if (authUser?.id && hasSession) {
    profileCreated = await createUserProfileRow(supabase, {
      id: authUser.id,
      email,
      full_name: fullName,
      section: sectionIdentifier,
      role: DEFAULT_USER_ROLE
    });
  }

  if (!profileCreated && authUser?.id) {
    const signInResult = await supabase.auth.signInWithPassword({ email, password });
    if (!signInResult.error) {
      const loggedInUser = signInResult.data?.user || signInResult.data?.session?.user;
      if (loggedInUser?.id) {
        profileCreated = await createUserProfileRow(supabase, {
          id: loggedInUser.id,
          email,
          full_name: fullName,
          section: sectionIdentifier,
          role: DEFAULT_USER_ROLE
        });
      }
    }
  }

  if (profileCreated) {
    showMessage('Sign up complete and profile saved. You are now ready to log in.');
    await notifyParentAuthUpdate();
    await closeParentLoginModal();
    return;
  }

  showMessage('Sign up complete. Please log in to finish account setup.');
}


document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.container');
  const infoButtons = document.querySelectorAll('.info-item .btn[data-mode]');
  const loginButton = document.getElementById('loginSubmitBtn');
  const signupButton = document.getElementById('signupSubmitBtn');
  const supabase = getSupabaseClient();

  if (!supabase) {
    console.warn('Supabase client could not be initialized inside login modal.');
  }

  infoButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!container) {
        return;
      }

      const mode = button.getAttribute('data-mode');
      container.classList.toggle('log-in', mode === 'signup');
      container.classList.remove('active');
    });
  });

  if (loginButton) {
    loginButton.addEventListener('click', async () => {
      const client = await waitForSupabaseClient();
      if (!client) {
        showMessage('Supabase is not configured for this login modal.');
        return;
      }
      await handleLogin(client);
    });
  }

  if (signupButton) {
    signupButton.addEventListener('click', async () => {
      const client = await waitForSupabaseClient();
      if (!client) {
        showMessage('Supabase is not configured for this login modal.');
        return;
      }
      await handleSignup(client);
    });
  }
});
