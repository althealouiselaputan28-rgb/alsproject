const ADMIN_SUPABASE_URL = window.SUPABASE_URL || (import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_URL);
const ADMIN_SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || (import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY);
const ADMIN_SUPABASE = (window.supabase && typeof window.supabase.createClient === 'function')
    ? window.supabase.createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_ANON_KEY)
    : null;

const adminAuthStatus = document.getElementById('adminAuthStatus');
const adminUserEmailHolder = document.getElementById('adminUserEmailHolder');
const adminUserEmail = document.getElementById('adminUserEmail');
const adminSignOutBtn = document.getElementById('adminSignOutBtn');
const adminUnauthMessage = document.getElementById('adminUnauthMessage');
const adminDenied = document.getElementById('adminDenied');
const adminContent = document.getElementById('adminContent');
const adminUsersLoading = document.getElementById('adminUsersLoading');
const adminUserList = document.getElementById('adminUserList');
const adminUserName = document.getElementById('adminUserName');
const adminUserEmailInput = document.getElementById('adminUserEmailInput');
const adminUserSection = document.getElementById('adminUserSection');
const adminUserRole = document.getElementById('adminUserRole');
const adminUserSaveBtn = document.getElementById('adminUserSaveBtn');
const adminUserCreateBtn = document.getElementById('adminUserCreateBtn');
const adminUserNewBtn = document.getElementById('adminUserNewBtn');
const adminUserFormMessage = document.getElementById('adminUserFormMessage');

let adminSelectedUserId = null;

function showAdminStatus(isSignedIn, email) {
    if (!adminAuthStatus || !adminUserEmailHolder || !adminSignOutBtn || !adminUnauthMessage || !adminDenied || !adminContent) return;

    if (isSignedIn) {
        adminAuthStatus.textContent = 'Signed in';
        adminUserEmailHolder.classList.remove('d-none');
        adminUnauthMessage.classList.add('d-none');
        adminSignOutBtn.classList.remove('d-none');
        adminUserEmail.textContent = email || 'Unknown user';
        adminDenied.classList.add('d-none');
        adminContent.classList.remove('d-none');
    } else {
        adminAuthStatus.textContent = 'Access Denied!';
        adminUserEmailHolder.classList.add('d-none');
        adminSignOutBtn.classList.add('d-none');
        adminUnauthMessage.classList.remove('d-none');
        adminDenied.classList.remove('d-none');
        adminContent.classList.add('d-none');
    }
}

async function checkAdminSession() {
    if (!ADMIN_SUPABASE) {
        showAdminStatus(false);
        return;
    }

    try {
        const { data, error } = await ADMIN_SUPABASE.auth.getSession();
        if (error || !data?.session) {
            showAdminStatus(false);
            return;
        }

        showAdminStatus(true, data.session.user.email || data.session.user.id);
    await loadExistingUsers();
    return true;
    } catch (error) {
        console.warn('Admin page session check failed', error);
        showAdminStatus(false);
        return false;
    }
}

function renderUserList(users) {
    if (!adminUserList || !adminUsersLoading) return;
    adminUserList.innerHTML = '';
    adminUsersLoading.classList.add('d-none');

    if (!users || users.length === 0) {
        adminUserList.innerHTML = '<div class="p-4 text-secondary">No users available.</div>';
        return;
    }

    users.forEach(user => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'list-group-item list-group-item-action bg-dark text-white border-secondary-subtle';
        button.textContent = `${user.full_name || '(No name)'} — ${user.email}`;
        button.addEventListener('click', () => selectAdminUser(user));
        adminUserList.appendChild(button);
    });
}

async function loadExistingUsers() {
    if (!ADMIN_SUPABASE) return;
    if (!adminUsersLoading) return;
    adminUsersLoading.textContent = 'Loading users...';
    adminUsersLoading.classList.remove('d-none');

    try {
        const { data, error } = await ADMIN_SUPABASE.from('users').select('id, email, full_name, section, role').order('email', { ascending: true });
        if (error) {
            console.error('Failed to fetch users', error);
            adminUsersLoading.textContent = 'Failed to load users.';
            return;
        }

        renderUserList(data || []);
    } catch (error) {
        console.error('Error loading users', error);
        adminUsersLoading.textContent = 'Failed to load users.';
    }
}

function selectAdminUser(user) {
    adminSelectedUserId = user.id;
    if (adminUserName) adminUserName.value = user.full_name || '';
    if (adminUserEmailInput) adminUserEmailInput.value = user.email || '';
    if (adminUserSection) adminUserSection.value = user.section || '';
    if (adminUserRole) adminUserRole.value = user.role || 'user';
    if (adminUserFormMessage) {
        adminUserFormMessage.textContent = 'Editing selected user.';
    }
}

function resetAdminUserForm() {
    adminSelectedUserId = null;
    if (adminUserName) adminUserName.value = '';
    if (adminUserEmailInput) adminUserEmailInput.value = '';
    if (adminUserSection) adminUserSection.value = '';
    if (adminUserRole) adminUserRole.value = 'user';
    if (adminUserFormMessage) adminUserFormMessage.textContent = 'Fill the form and click Create User to add a new account.';
}

async function createAdminUser() {
    if (!ADMIN_SUPABASE || !adminUserFormMessage) return;

    const newUser = {
        full_name: adminUserName?.value.trim() || null,
        email: adminUserEmailInput?.value.trim() || null,
        section: adminUserSection?.value.trim() || null,
        role: adminUserRole?.value || 'user'
    };

    if (!newUser.full_name || !newUser.email || !newUser.section) {
        adminUserFormMessage.textContent = 'Name, email, and section are required to create a user.';
        return;
    }

    adminUserSaveBtn.disabled = true;
    if (adminUserCreateBtn) adminUserCreateBtn.disabled = true;
    adminUserFormMessage.textContent = 'Creating user...';

    try {
        const { data, error } = await ADMIN_SUPABASE.from('users').insert([newUser]);
        if (error) {
            console.error('Failed to create user', error);
            adminUserFormMessage.textContent = `Create failed: ${error.message}`;
            return;
        }

        adminUserFormMessage.textContent = 'User created successfully.';
        await loadExistingUsers();
        if (data && data.length > 0) {
            selectAdminUser(data[0]);
        } else {
            resetAdminUserForm();
        }
    } catch (error) {
        console.error('Error creating user', error);
        adminUserFormMessage.textContent = 'Create failed. See console.';
    } finally {
        if (adminUserSaveBtn) adminUserSaveBtn.disabled = false;
        if (adminUserCreateBtn) adminUserCreateBtn.disabled = false;
    }
}

async function saveAdminUser() {
    if (!ADMIN_SUPABASE) return;
    if (!adminUserFormMessage) return;
    if (!adminSelectedUserId) {
        await createAdminUser();
        return;
    }

    const updatedUser = {
        full_name: adminUserName?.value.trim() || null,
        email: adminUserEmailInput?.value.trim() || null,
        section: adminUserSection?.value.trim() || null,
        role: adminUserRole?.value || 'user'
    };

    adminUserSaveBtn.disabled = true;
    adminUserFormMessage.textContent = 'Saving changes...';

    try {
        const { error } = await ADMIN_SUPABASE.from('users').update(updatedUser).eq('id', adminSelectedUserId);
        if (error) {
            console.error('Failed to update user', error);
            adminUserFormMessage.textContent = `Save failed: ${error.message}`;
            return;
        }

        adminUserFormMessage.textContent = 'User updated successfully.';
        await loadExistingUsers();
    } catch (error) {
        console.error('Error saving user', error);
        adminUserFormMessage.textContent = 'Save failed. See console.';
    } finally {
        if (adminUserSaveBtn) adminUserSaveBtn.disabled = false;
    }
}

if (adminSignOutBtn) {
    adminSignOutBtn.addEventListener('click', async () => {
        if (!ADMIN_SUPABASE) return;
        await ADMIN_SUPABASE.auth.signOut();
        showAdminStatus(false);
    });
}

if (adminUserSaveBtn) {
    adminUserSaveBtn.addEventListener('click', saveAdminUser);
}

if (adminUserCreateBtn) {
    adminUserCreateBtn.addEventListener('click', createAdminUser);
}

if (adminUserNewBtn) {
    adminUserNewBtn.addEventListener('click', resetAdminUserForm);
}

checkAdminSession();
