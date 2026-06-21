/* Client entry script — uses dynamic import for Supabase so the page still runs on plain static servers */
(async function() {
    let supabase = null;

    try {
        const mod = await import('@supabase/supabase-js');
        const createClient = mod.createClient;
        const SUPABASE_URL = (import.meta && import.meta.env) ? import.meta.env.VITE_SUPABASE_URL : undefined;
        const SUPABASE_ANON_KEY = (import.meta && import.meta.env) ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined;

        if (SUPABASE_URL && SUPABASE_ANON_KEY) {
            supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
    } catch (err) {
        console.warn('Dynamic import of @supabase/supabase-js failed — will try CDN/global fallback if present.', err);
    }

    // CDN/global fallback: if the UMD script is included and global variables are provided
    let activeSupabaseUrl = null;
    let activeSupabaseKey = null;
    if (!supabase) {
        const SUPABASE_URL = window.SUPABASE_URL || (import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_URL);
        const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || (import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY);
        activeSupabaseUrl = SUPABASE_URL;
        activeSupabaseKey = SUPABASE_ANON_KEY;
        if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
            try {
                supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                console.info('Supabase initialized via CDN/global fallback.');
            } catch (e) {
                console.warn('CDN/global Supabase initialization failed.', e);
            }
        }
    }

    console.group('Supabase debug');
    console.log('Supabase available:', !!supabase);
    if (supabase) {
        console.log('Active Supabase URL:', activeSupabaseUrl || (import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_URL));
        window.supabaseClient = supabase;
        window.supabaseInstance = supabase;
        window.$supabase = supabase;
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            window.supabase = supabase;
        }
        console.log('Use supabaseClient.auth.getSession() or supabase.auth.getSession() if available.');
    }
    console.groupEnd();

    // Initialize Quill (script included in index.html)
    let quill = null;
    try {
        quill = new Quill('#editor-container', {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    [{ color: [] }, { background: [] }],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        });
    } catch (e) {
        console.warn('Quill not available or editor not on page.', e);
    }
    // editing state
    let editingArticleId = null;
    let editingRosterId = null;
    let editingRosterImageUrl = '';

    // DOM handles
    const authBtn = document.getElementById('authBtn');
    const createPostBtn = document.getElementById('createPostBtn');
    const publishPostBtn = document.getElementById('publishPostBtn');
    const postTitleInput = document.getElementById('postTitle');
    const articleFeed = document.getElementById('articleFeed');
    const feedLoader = document.getElementById('feedLoader');
    const navbarLinks = document.querySelectorAll('[data-page]');
    const pages = {
        home: document.getElementById('homePage'),
        information: document.getElementById('informationPage'),
        roster: document.getElementById('rosterPage')
    };

    // safe modal init
    let bootstrapModal = null;
    let loginBootstrapModal = null;
    const loginForm = document.getElementById('loginForm');
    const loginEmailInput = document.getElementById('loginEmail');
    const loginPasswordInput = document.getElementById('loginPassword');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const rosterSectionInput = document.getElementById('rosterSection');
    try {
        bootstrapModal = new bootstrap.Modal(document.getElementById('editorModal'));
    } catch (e) {
        console.warn('Bootstrap modal not available.', e);
    }
    try {
        loginBootstrapModal = new bootstrap.Modal(document.getElementById('loginModal'));
    } catch (e) {
        console.warn('Login modal not available.', e);
    }

    function activatePage(pageKey, updateHash = true) {
        if (!pageKey || !pages[pageKey]) pageKey = 'home';

        navbarLinks.forEach(nav => {
            nav.classList.toggle('active', nav.dataset.page === pageKey);
        });

        Object.keys(pages).forEach(key => {
            pages[key].classList.toggle('active-section', key === pageKey);
        });

        if (updateHash) window.location.hash = `#${pageKey}`;
    }

    function updateAuthButton(session) {
        if (!authBtn) return;
        if (session && session.user) {
            authBtn.textContent = 'Logout';
            authBtn.classList.replace('btn-outline-danger', 'btn-danger');
            if (createPostBtn) createPostBtn.classList.remove('d-none');
        } else {
            authBtn.textContent = 'Login';
            authBtn.classList.replace('btn-danger', 'btn-outline-danger');
            if (createPostBtn) createPostBtn.classList.add('d-none');
        }
    }

    async function checkSessionState() {
        if (!supabase) {
            updateAuthButton(null);
            return null;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) {
            console.error('Session retrieval error', error);
            updateAuthButton(null);
            return null;
        }

        updateAuthButton(data.session);
        return data.session;
    }

    // Auth button behavior (guarded)
    if (authBtn) {
        authBtn.addEventListener('click', async () => {
            if (!supabase) {
                alert('Authentication is unavailable on this static server.');
                return;
            }

            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
                console.error('Session check error', sessionError);
            }

            if (session) {
                await supabase.auth.signOut();
                updateAuthButton(null);
                updateAuthUI();
                return;
            }

            if (loginBootstrapModal) {
                loginBootstrapModal.show();
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!supabase) {
                alert('Authentication is unavailable on this static server.');
                return;
            }

            const email = loginEmailInput?.value.trim();
            const password = loginPasswordInput?.value;
            if (!email || !password) {
                alert('Please enter both email and password.');
                return;
            }

            if (loginSubmitBtn) {
                loginSubmitBtn.disabled = true;
                loginSubmitBtn.textContent = 'Signing In...';
            }

            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            console.log('SignIn response', data, error);

            if (error) {
                alert(`Access Rejected: ${error.message}`);
                if (loginSubmitBtn) {
                    loginSubmitBtn.disabled = false;
                    loginSubmitBtn.textContent = 'Sign In';
                }
                return;
            }

            await checkSessionState();
            updateAuthUI();
            if (loginBootstrapModal) {
                loginBootstrapModal.hide();
            }
            if (loginEmailInput) loginEmailInput.value = '';
            if (loginPasswordInput) loginPasswordInput.value = '';
            if (loginSubmitBtn) {
                loginSubmitBtn.disabled = false;
                loginSubmitBtn.textContent = 'Sign In';
            }
        });
    }

    // Ensure create post clears edit state before showing modal
    if (createPostBtn) {
        createPostBtn.addEventListener('click', () => {
            editingArticleId = null;
            if (postTitleInput) postTitleInput.value = '';
            if (quill) quill.setText('');
            publishPostBtn.textContent = 'Publish Post';
        });
    }

    if (supabase && supabase.auth && typeof supabase.auth.onAuthStateChange === 'function') {
        supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state change:', event, session);
            updateAuthButton(session);
        });
    }

    // Navigation links
    if (navbarLinks && navbarLinks.length) {
        navbarLinks.forEach(link => {
            link.addEventListener('click', event => {
                event.preventDefault();
                const page = link.dataset.page;
                if (!page || !pages[page]) return;
                activatePage(page);
            });
        });

        window.addEventListener('hashchange', () => {
            const page = window.location.hash.replace('#', '');
            activatePage(page, false);
        });

        // activate from hash or default
        activatePage(window.location.hash.replace('#', '') || 'home', false);
    }

    // Fetch articles (guarded)
    async function fetchArticles() {
        if (!supabase) {
            if (feedLoader) feedLoader.textContent = 'Offline mode — articles unavailable.';
            return;
        }

        try {
            const { data: articles, error } = await supabase
                .from('articles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                if (feedLoader) feedLoader.textContent = 'Failed to synchronize operational intelligence array.';
                console.error(error);
                return;
            }

            if (!articles || articles.length === 0) {
                if (feedLoader) feedLoader.textContent = 'No field updates published at this time.';
                return;
            }

            if (feedLoader) feedLoader.remove();
            if (articleFeed) articleFeed.innerHTML = '';

            articles.forEach(article => {
                const dateStr = new Date(article.created_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric'
                });

                const newArticle = document.createElement('article');
                newArticle.className = 'card custom-card mb-4 article-card';
                const body = document.createElement('div');
                body.className = 'card-body p-4 position-relative';
                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'btn btn-sm btn-outline-secondary edit-article-btn d-none';
                editBtn.textContent = 'Edit';
                editBtn.addEventListener('click', () => {
                    editingArticleId = article.id;
                    if (postTitleInput) postTitleInput.value = article.title || '';
                    if (quill) quill.root.innerHTML = article.content || '';
                    if (bootstrapModal) bootstrapModal.show();
                    publishPostBtn.textContent = 'Update Post';
                });

                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'btn btn-sm btn-outline-danger delete-article-btn d-none ms-2';
                deleteBtn.textContent = 'Delete';
                deleteBtn.addEventListener('click', async () => {
                    if (!confirm('Delete this article? This cannot be undone.')) return;
                    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                    if (sessionError || !session) {
                        alert('You must be signed in to delete.');
                        return;
                    }
                    const res = await supabase.from('articles').delete().eq('id', article.id);
                    if (res.error) {
                        alert(`Delete failed: ${res.error.message}`);
                    } else {
                        await fetchArticles();
                    }
                });

                const titleEl = document.createElement('h3');
                titleEl.className = 'card-title h4 text-white fw-bold';
                titleEl.textContent = article.title;

                const meta = document.createElement('p');
                meta.className = 'text-secondary small';
                meta.textContent = `Published on: ${dateStr}`;

                const contentDiv = document.createElement('div');
                contentDiv.className = 'card-text text-light';
                contentDiv.innerHTML = article.content;

                body.appendChild(editBtn);
                body.appendChild(deleteBtn);
                body.appendChild(titleEl);
                body.appendChild(meta);
                body.appendChild(contentDiv);
                newArticle.appendChild(body);

                articleFeed.appendChild(newArticle);
            });
        } catch (e) {
            console.error('Error fetching articles', e);
            if (feedLoader) feedLoader.textContent = 'Failed to load articles.';
        }
    }

    // Publish handler (guarded)
    if (publishPostBtn) {
        publishPostBtn.addEventListener('click', async () => {
            if (!supabase) {
                alert('Cannot publish without Supabase configured.');
                return;
            }

            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) {
                alert('You must be signed in to publish.');
                publishPostBtn.disabled = false;
                publishPostBtn.textContent = 'Publish Post';
                return;
            }

            const title = (postTitleInput && postTitleInput.value) ? postTitleInput.value.trim() : '';
            const contentHTML = quill ? quill.root.innerHTML : '';

            if (!title || contentHTML === '<p><br></p>' || !contentHTML) {
                alert('All fields must be filled prior to content authorization.');
                return;
            }

            publishPostBtn.disabled = true;
            publishPostBtn.textContent = 'Transmitting...';

            let error = null;
            if (editingArticleId) {
                const res = await supabase
                    .from('articles')
                    .update({ title, content: contentHTML })
                    .eq('id', editingArticleId);
                error = res.error;
            } else {
                const res = await supabase
                    .from('articles')
                    .insert([{ title, content: contentHTML, created_by: session.user.id }]);
                error = res.error;
            }

            if (error) {
                alert(`Transmission Error encountered: ${error.message}`);
            } else {
                if (postTitleInput) postTitleInput.value = '';
                if (quill) quill.setText('');
                if (bootstrapModal) bootstrapModal.hide();
                await fetchArticles();
                editingArticleId = null;
                publishPostBtn.textContent = 'Publish Post';
            }

            publishPostBtn.disabled = false;
            publishPostBtn.textContent = 'Publish Post';
        });
    }

    // Initial run
    fetchArticles();
    await checkSessionState();
    await fetchRoster();

    // Roster: fetch and display
    async function fetchRoster() {
            const rosterAlcala = document.getElementById('rosterAlcala');
            const rosterCabrera = document.getElementById('rosterCabrera');
            if (!rosterAlcala || !rosterCabrera) return;

            rosterAlcala.innerHTML = '';
            rosterCabrera.innerHTML = '';

            if (!supabase) {
                rosterAlcala.innerHTML = '<div class="col-12 text-secondary">Roster unavailable in offline mode.</div>';
                rosterCabrera.innerHTML = '<div class="col-12 text-secondary">Roster unavailable in offline mode.</div>';
                return;
            }

            try {
                const { data, error } = await supabase.from('roster').select('*').order('created_at', { ascending: false });
                if (error) {
                    rosterAlcala.innerHTML = `<div class="col-12 text-danger">Failed to load roster: ${error.message}</div>`;
                    rosterCabrera.innerHTML = `<div class="col-12 text-danger">Failed to load roster: ${error.message}</div>`;
                    return;
                }

                if (!data || data.length === 0) {
                    rosterAlcala.innerHTML = '<div class="col-12 text-secondary">No roster entries yet.</div>';
                    rosterCabrera.innerHTML = '<div class="col-12 text-secondary">No roster entries yet.</div>';
                    return;
                }

                data.forEach(item => {
                    const col = document.createElement('div');
                    col.className = 'col-12 col-md-6 col-lg-4';
                    const card = document.createElement('div');
                    card.className = 'p-3 rounded roster-card text-center';
                    // roster edit button
                    const rosterEditBtn = document.createElement('button');
                    rosterEditBtn.type = 'button';
                    rosterEditBtn.className = 'btn btn-sm btn-outline-secondary edit-roster-btn d-none';
                    rosterEditBtn.textContent = 'Edit';
                    rosterEditBtn.addEventListener('click', () => {
                        editingRosterId = item.id;
                        editingRosterImageUrl = item.image_url || '';
                        const nameInput = document.getElementById('studentName');
                        const subtitleInput = document.getElementById('studentSubtitle');
                        if (nameInput) nameInput.value = item.name || '';
                        if (subtitleInput) subtitleInput.value = item.subtitle || '';
                        const modal = new bootstrap.Modal(document.getElementById('addStudentModal'));
                        modal.show();
                    });

                    const rosterDeleteBtn = document.createElement('button');
                    rosterDeleteBtn.type = 'button';
                    rosterDeleteBtn.className = 'btn btn-sm btn-outline-danger delete-roster-btn d-none';
                    rosterDeleteBtn.textContent = 'Delete';
                    rosterDeleteBtn.addEventListener('click', async () => {
                        if (!confirm('Delete this roster entry? This cannot be undone.')) return;
                        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                        if (sessionError || !session) {
                            alert('You must be signed in to delete.');
                            return;
                        }
                        const res = await supabase.from('roster').delete().eq('id', item.id);
                        if (res.error) {
                            alert(`Delete failed: ${res.error.message}`);
                        } else {
                            await fetchRoster();
                        }
                    });
                    const rosterActionWrap = document.createElement('div');
                    rosterActionWrap.className = 'roster-action-wrap';
                    rosterActionWrap.appendChild(rosterEditBtn);
                    rosterActionWrap.appendChild(rosterDeleteBtn);
                    card.appendChild(rosterActionWrap);
                    const img = document.createElement('img');
                    img.src = item.image_url || '';
                    img.alt = item.name || '';
                    img.style.maxWidth = '100%';
                    img.style.height = '170px';
                    img.style.objectFit = 'cover';
                    img.className = 'mb-2 rounded roster-photo';
                    const name = document.createElement('div');
                    name.className = 'text-white fw-bold roster-name';
                    name.textContent = item.name || 'Unnamed';
                    card.appendChild(img);
                    card.appendChild(name);
                    const subtitle = (item.subtitle || '').toString().trim();
                    if (subtitle && subtitle.toLowerCase() !== 'none') {
                        const subtitleEl = document.createElement('div');
                        subtitleEl.className = 'text-secondary roster-subtitle';
                        subtitleEl.textContent = subtitle;
                        card.appendChild(subtitleEl);
                    }

                    const lowerSubtitle = subtitle.toLowerCase();
                    const isCabrera = lowerSubtitle.includes('cabrera');
                    const targetSection = isCabrera ? rosterCabrera : rosterAlcala;

                    col.appendChild(card);
                    targetSection.appendChild(col);
                });
            } catch (e) {
                rosterAlcala.innerHTML = '<div class="col-12 text-danger">Error loading roster.</div>';
                rosterCabrera.innerHTML = '<div class="col-12 text-danger">Error loading roster.</div>';
                console.error(e);
            }
        }

        // Hook section-specific add buttons
        const sectionAddBtns = document.querySelectorAll('.section-add-btn');
        sectionAddBtns.forEach(button => {
            button.addEventListener('click', () => {
                editingRosterId = null;
                editingRosterImageUrl = '';
                const section = button.dataset.section;
                const nameInput = document.getElementById('studentName');
                const subtitleInput = document.getElementById('studentSubtitle');
                if (rosterSectionInput) rosterSectionInput.value = section || '';
                if (nameInput) nameInput.value = '';
                if (subtitleInput) subtitleInput.value = section === 'cabrera' ? 'Section Cabrera' : 'Section Alcala';
                const modal = new bootstrap.Modal(document.getElementById('addStudentModal'));
                modal.show();
            });
        });

        // Hook Add Student form
        const addStudentForm = document.getElementById('addStudentForm');
        const addStudentBtn = document.getElementById('addStudentBtn');
        if (addStudentBtn) {
            addStudentBtn.addEventListener('click', () => {
                if (rosterSectionInput) rosterSectionInput.value = '';
            });
        }
        if (addStudentForm) {
            addStudentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!supabase) {
                    alert('Cannot upload — Supabase not configured on this server.');
                    return;
                }

                const nameInput = document.getElementById('studentName');
                    const subtitleInput = document.getElementById('studentSubtitle');
                    const fileInput = document.getElementById('studentPhoto');
                    const file = fileInput.files[0];
                    const name = nameInput.value.trim();
                    const subtitle = subtitleInput.value.trim();
                if (!name || (!file && !editingRosterId)) {
                    alert('Please provide a name and photo.');
                    return;
                }

                const safeFileName = file ? file.name.replace(/[^a-zA-Z0-9_.-]/g, '_') : '';
                const filename = file ? `roster/${Date.now()}_${safeFileName}` : '';
                console.log('Uploading file path', filename || '(no new file)', 'bucket roster-photos');
                try {
                    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                    console.log('Upload session', session, sessionError);
                    if (sessionError || !session) {
                        throw new Error('Admin session not found.');
                    }

                    let imageUrl = editingRosterImageUrl || '';

                    // If a new file was chosen, upload it; otherwise reuse existing image URL for edits
                    if (file) {
                        const { data: uploadData, error: uploadError } = await supabase.storage.from('roster-photos').upload(filename, file, { cacheControl: '3600', upsert: false });
                        console.log('Storage upload result', uploadData, uploadError);
                        if (uploadError) {
                            console.error('Storage upload error details', uploadError);
                            throw uploadError;
                        }

                        const { data: publicUrlData, error: publicUrlError } = supabase.storage.from('roster-photos').getPublicUrl(filename);
                        if (publicUrlError) {
                            console.error('Public URL error', publicUrlError);
                            throw publicUrlError;
                        }
                        imageUrl = publicUrlData.publicUrl;
                    }

                    const rosterRow = { name, image_url: imageUrl, created_by: session.user.id };
                    const normalizedSubtitle = subtitle.toLowerCase() === 'none' ? '' : subtitle;
                    const selectedSection = rosterSectionInput?.value;
                    if (normalizedSubtitle) {
                        rosterRow.subtitle = normalizedSubtitle;
                    } else if (selectedSection) {
                        rosterRow.subtitle = selectedSection === 'cabrera' ? 'Section Cabrera' : 'Section Alcala';
                    }

                    // If editing, update the existing row; otherwise insert
                    let dbRes;
                    if (editingRosterId) {
                        dbRes = await supabase.from('roster').update(rosterRow).eq('id', editingRosterId);
                    } else {
                        dbRes = await supabase.from('roster').insert([rosterRow]);
                    }
                    if (dbRes.error) throw dbRes.error;

                    // clear and close modal
                    nameInput.value = '';
                    if (fileInput) fileInput.value = '';
                    const modal = bootstrap.Modal.getInstance(document.getElementById('addStudentModal'));
                    if (modal) modal.hide();
                    if (rosterSectionInput) rosterSectionInput.value = '';
                    await fetchRoster();
                    updateAuthUI();
                    editingRosterId = null;
                    editingRosterImageUrl = '';
                } catch (err) {
                    if (err && err.status) {
                        console.error('Upload failed with status', err.status, err.message, err);
                        console.log('message:', err.message);
                        console.log('status:', err.status);
                        console.log('name:', err.name);
                        console.log('error json:', JSON.stringify(err, null, 2));
                    } else {
                        console.error('Upload error', err);
                    }
                    alert(err?.message || 'Upload failed');
                }
            });
        }

        // Expose fetchRoster to initial run
        fetchRoster();

        // Show admin-only UI when signed in
        async function updateAuthUI() {
            const addBtn = document.getElementById('addStudentBtn');
            const createBtn = document.getElementById('createPostBtn');
            if (!supabase) {
                if (addBtn) addBtn.classList.add('d-none');
                if (createBtn) createBtn.classList.add('d-none');
                return;
            }

            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    if (addBtn) addBtn.classList.remove('d-none');
                    if (createBtn) createBtn.classList.remove('d-none');
                        // reveal section add buttons, edit and delete buttons
                        document.querySelectorAll('.section-add-btn').forEach(b => b.classList.remove('d-none'));
                        document.querySelectorAll('.edit-article-btn').forEach(b => b.classList.remove('d-none'));
                        document.querySelectorAll('.edit-roster-btn').forEach(b => b.classList.remove('d-none'));
                        document.querySelectorAll('.delete-article-btn').forEach(b => b.classList.remove('d-none'));
                        document.querySelectorAll('.delete-roster-btn').forEach(b => b.classList.remove('d-none'));
                } else {
                    if (addBtn) addBtn.classList.add('d-none');
                    if (createBtn) createBtn.classList.add('d-none');
                        document.querySelectorAll('.section-add-btn').forEach(b => b.classList.add('d-none'));
                        document.querySelectorAll('.edit-article-btn').forEach(b => b.classList.add('d-none'));
                        document.querySelectorAll('.edit-roster-btn').forEach(b => b.classList.add('d-none'));
                        document.querySelectorAll('.delete-article-btn').forEach(b => b.classList.add('d-none'));
                        document.querySelectorAll('.delete-roster-btn').forEach(b => b.classList.add('d-none'));
                }
            } catch (e) {
                console.warn('Failed to check session', e);
                if (addBtn) addBtn.classList.add('d-none');
            }
        }

        updateAuthUI();

})();
