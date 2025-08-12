// ===== QR ATTENDANCE SYSTEM - FINAL FIXED SCRIPT.JS =====

// ===== CONFIGURATION =====
const CONFIG = {
    // Supabase configuration
    SUPABASE_URL: 'https://zpesqzstorixfsmpntsx.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    TOAST_DURATION: 5000,
    QR_SIZE: 300,
    QR_ERROR_LEVEL: 'M',
    WEBAUTHN_TIMEOUT: 60000,
    RP_NAME: "QR Attendance System",
    VALIDATION: {
        USN_PATTERN: /^[A-Za-z0-9]{6,15}$/,
        NAME_PATTERN: /^[A-Za-z\s\-']{2,50}$/,
        SESSION_NAME_MIN_LENGTH: 3,
        SESSION_NAME_MAX_LENGTH: 100
    }
};

// ===== GLOBAL STATE =====
let supabaseClient = null;
let currentUser = null;
let allStudents = [];
let presentStudents = [];
let currentSession = null;
let allSessions = [];
let allCourses = [];
let selectedStudentForAttendance = null;
let studentsCache = new Map();
let coursesCache = new Map();
let lastFetchTime = 0;
let isOnline = navigator.onLine;
let attendanceSubscription = null;
let studentSubscription = null;
let webAuthnSupported = false;


// ===== UTILITY FUNCTIONS =====
const utils = {
    sanitizeText: (input) => (input ? String(input).replace(/[<>]/g, '').trim() : ''),
    isValidUSN: (usn) => CONFIG.VALIDATION.USN_PATTERN.test(usn || ''),
    isValidName: (name) => CONFIG.VALIDATION.NAME_PATTERN.test(name || ''),
    isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || ''),
    isValidSessionName: (name) => {
        const trimmed = (name || '').trim();
        return trimmed.length >= CONFIG.VALIDATION.SESSION_NAME_MIN_LENGTH && trimmed.length <= CONFIG.VALIDATION.SESSION_NAME_MAX_LENGTH;
    },
    debounce: (func, wait) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    },
    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    formatTimestamp: (ts) => new Date(ts).toLocaleString(),
    getRelativeTime: (ts) => {
        const diff = (new Date() - new Date(ts)) / 1000;
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    },
    downloadCSV: (data, filename) => {
        if (!window.Papa) return console.error('PapaParse not loaded');
        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },
    getQueryParam: (param) => new URLSearchParams(window.location.search).get(param),
    generateStudentURL: (sessionId) => `${window.location.origin}/student.html?session=${encodeURIComponent(sessionId)}`
};

// ===== UI MANAGEMENT =====
const ui = {
    showToast: (message, type = 'info') => {
        const container = document.getElementById('toast-root');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${utils.sanitizeText(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), CONFIG.TOAST_DURATION);
    },
    showModal: (content, options = {}) => {
        ui.hideModal();
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: ${options.maxWidth || '700px'}">
                <div class="modal-header">
                    <h3>${options.title || ''}</h3>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">${content}</div>
            </div>`;
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
    },
    hideModal: () => {
        const modal = document.querySelector('.modal.active');
        if (modal) modal.remove();
        document.body.style.overflow = '';
    }
};

// ===== AUTHENTICATION =====
const auth = {
    init: async () => {
        if (!window.supabase) {
            console.error("Supabase not loaded");
            return;
        }
        supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
        supabaseClient.auth.onAuthStateChange((event, session) => {
            currentUser = session?.user || null;
            auth.handleRouteChange();
        });
        const { data: { session } } = await supabaseClient.auth.getSession();
        currentUser = session?.user || null;
        auth.handleRouteChange();
    },
    handleRouteChange: () => {
        const isAuthPage = window.location.pathname.includes('login.html');
        const isProtectedPage = !isAuthPage && !window.location.pathname.includes('student.html');
        if (isProtectedPage && !currentUser) {
            window.location.href = 'login.html';
        }
        if (isAuthPage && currentUser) {
            window.location.href = 'index.html';
        }
    },
    login: async (email, password) => {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        ui.showToast('Login successful!', 'success');
    },
    logout: async () => {
        await supabaseClient.auth.signOut();
        ui.showToast('Logged out successfully', 'info');
    }
};

// ===== DATA OPERATIONS =====
const data = {
    fetchAllStudents: async () => {
        const { data, error } = await supabaseClient.from('students').select('name, usn').order('name');
        if (error) throw error;
        allStudents = data || [];
        return allStudents;
    },
    fetchAllCourses: async () => {
        const { data, error } = await supabaseClient.from('courses').select('*').order('course_name');
        if (error) throw error;
        allCourses = data || [];
        return allCourses;
    },
    fetchCurrentSessionAttendance: async () => {
        if (!currentSession) return [];
        const { data: records, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, timestamp, fingerprint_verified, location_verified')
            .eq('session_id', currentSession.id)
            .order('timestamp', { ascending: false });
        if (error) throw error;
        presentStudents = records || [];
        pages.renderPresentStudents();
        return presentStudents;
    },
    fetchAllSessions: async () => {
        const { data: sessionsData, error } = await supabaseClient.from('sessions').select('*, courses(course_name, course_id)').order('created_at', { ascending: false });
        if (error) throw error;
        allSessions = await Promise.all(sessionsData.map(async (session) => {
            const { count } = await supabaseClient.from('attendance').select('*', { count: 'exact', head: true }).eq('session_id', session.id);
            return { ...session, attendance_count: count || 0 };
        }));
        return allSessions;
    }
};

// ===== SESSION MANAGEMENT =====
const sessions = {
    updateActiveSession: (session) => {
        currentSession = session;
        localStorage.setItem('sessionId', session ? session.id : null);
        pages.renderDashboard();
        if (session) {
            realtime.subscribeToAttendance(session.id);
            data.fetchCurrentSessionAttendance();
        } else {
            realtime.unsubscribe();
        }
    },
    restoreActiveSession: async () => {
        const sessionId = localStorage.getItem('sessionId');
        if (sessionId && sessionId !== 'null') {
            const { data: session, error } = await supabaseClient.from('sessions').select('*, courses(course_name, course_id)').eq('id', sessionId).single();
            if (session && !error) {
                sessions.updateActiveSession(session);
                ui.showToast(`Session "${session.session_name}" restored.`, 'success');
            } else {
                sessions.updateActiveSession(null);
            }
        }
    }
};

// ===== REALTIME SUBSCRIPTIONS =====
const realtime = {
    subscribeToAttendance: (sessionId) => {
        realtime.unsubscribe();
        attendanceSubscription = supabaseClient
            .channel(`attendance-changes-${sessionId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `session_id=eq.${sessionId}` },
                () => data.fetchCurrentSessionAttendance()
            )
            .subscribe();
    },
    unsubscribe: () => {
        if (attendanceSubscription) {
            supabaseClient.removeChannel(attendanceSubscription);
            attendanceSubscription = null;
        }
    }
}

// ===== PAGE RENDERING AND LOGIC =====
const pages = {
    init: async () => {
        await auth.init();
        const path = window.location.pathname;
        if (path.includes('login.html')) pages.initLoginPage();
        else if (path.includes('student.html')) pages.initStudentPage();
        else pages.initFacultyDashboard();
        
        // ** THE FIX: Centralized Event Listener **
        document.body.addEventListener('click', pages.handleGlobalClick);
    },
    initLoginPage: () => {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
                try {
                    await auth.login(e.target.email.value, e.target.password.value);
                } catch (error) {
                    ui.showToast(error.message, 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
                }
            });
        }
    },
    initFacultyDashboard: async () => {
        if (!currentUser) return;
        await Promise.all([data.fetchAllStudents(), data.fetchAllCourses(), sessions.restoreActiveSession()]);
        pages.renderDashboard();
    },
    initStudentPage: async () => {
        const sessionId = utils.getQueryParam('session');
        if (!sessionId) return ui.showErrorPage('No session ID provided.');

        const { data: sessionData, error } = await supabaseClient.from('sessions').select('*, courses(course_name, course_id)').eq('id', sessionId).single();
        if (error || !sessionData) return ui.showErrorPage('Invalid or expired session.');
        
        currentSession = sessionData;
        await data.fetchAllStudents();

        const sessionNameEl = document.getElementById('session-name-display');
        const courseNameEl = document.getElementById('course-name-display');
        const studentListEl = document.getElementById('student-list');
        const searchInput = document.getElementById('student-search');

        if (sessionNameEl) sessionNameEl.textContent = utils.sanitizeText(sessionData.session_name);
        if (courseNameEl) courseNameEl.textContent = sessionData.courses ? utils.sanitizeText(sessionData.courses.course_name) : 'General';
        
        pages.renderStudentListForSelection();

        if (searchInput) {
            searchInput.addEventListener('input', utils.debounce((e) => {
                pages.renderStudentListForSelection(e.target.value);
            }, 300));
        }
        
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.style.display = 'none';
    },

    // ===== EVENT HANDLER =====
    handleGlobalClick: async (e) => {
        const target = e.target;
        // Faculty Dashboard Buttons
        if (target.closest('#logout-btn')) auth.logout();
        if (target.closest('#start-session-btn')) pages.showStartSessionModal();
        if (target.closest('#add-manually-btn')) pages.showAddManuallyModal();
        if (target.closest('#manage-students-btn')) pages.showStudentsModal();
        if (target.closest('#session-history-btn')) pages.showSessionHistoryModal();
        if (target.closest('#export-attendance-btn')) pages.exportCurrentSessionData();
        if (target.closest('#statistics-btn')) pages.showStatisticsModal();
        if (target.closest('#manage-courses-btn')) pages.showCoursesModal();
        if (target.closest('#refresh-data-btn')) pages.initFacultyDashboard();

        // Student Page Buttons
        if (target.closest('#submit-attendance')) pages.handleStudentAttendanceSubmit();
        const studentSelectItem = target.closest('#student-list .student-item');
        if(studentSelectItem) {
            document.querySelectorAll('#student-list .student-item.selected').forEach(el => el.classList.remove('selected'));
            studentSelectItem.classList.add('selected');
            selectedStudentForAttendance = allStudents.find(s => s.usn === studentSelectItem.dataset.usn);
            document.getElementById('submit-attendance').disabled = false;
        }

        // Modal Buttons
        if(target.closest('.close-btn') || target.matches('.modal.active')) ui.hideModal();
        if(target.closest('.delete-student-btn')) {
            const usn = target.closest('.delete-student-btn').dataset.usn;
            if (confirm(`Are you sure you want to delete student ${usn}?`)) {
                await actions.deleteStudent(usn);
                pages.showStudentsModal(); // Re-render modal
            }
        }
        if(target.closest('.delete-course-btn')) {
            const courseId = target.closest('.delete-course-btn').dataset.id;
            if (confirm(`Are you sure you want to delete this course?`)) {
                await actions.deleteCourse(courseId);
                pages.showCoursesModal(); // Re-render modal
            }
        }
        if(target.closest('.activate-session-btn')) {
            const sessionId = target.closest('.activate-session-btn').dataset.id;
            const session = allSessions.find(s => s.id == sessionId);
            if (session) sessions.updateActiveSession(session);
            ui.hideModal();
        }
        if(target.closest('.remove-btn')) {
             const usn = target.closest('.remove-btn').dataset.usn;
             if(confirm(`Remove attendance for ${usn}?`)) {
                await actions.removeAttendance(usn);
             }
        }
    },
    
    // ===== RENDER FUNCTIONS =====
    renderDashboard: () => {
        const presentCountEl = document.getElementById('present-count');
        const sessionTitleEl = document.getElementById('current-session-title');
        const qrContainerEl = document.getElementById('qr-code-container');

        if (presentCountEl) presentCountEl.textContent = presentStudents.length;
        if (sessionTitleEl) sessionTitleEl.textContent = currentSession ? `Active: ${utils.sanitizeText(currentSession.session_name)}` : 'No Active Session';

        if (qrContainerEl) {
            qrContainerEl.innerHTML = '';
            if (currentSession && window.QRious) {
                const url = utils.generateStudentURL(currentSession.id);
                new QRious({ element: qrContainerEl.appendChild(document.createElement('canvas')), value: url, size: CONFIG.QR_SIZE });
                qrContainerEl.insertAdjacentHTML('beforeend', `<p class="qr-instruction">Students scan this QR code</p>`);
            } else {
                qrContainerEl.innerHTML = '<p class="qr-placeholder">Start a session to generate QR code</p>';
            }
        }
        pages.renderPresentStudents();
    },
    renderPresentStudents: () => {
        const listEl = document.getElementById('present-students-list');
        if (!listEl) return;
        if (presentStudents.length === 0) {
            listEl.innerHTML = '<li class="no-students-message">No students present yet</li>';
            return;
        }
        listEl.innerHTML = presentStudents.map(s => `
            <li class="student-item">
                <div class="student-info">
                    <span class="student-name">${utils.sanitizeText(s.student)}</span>
                    <span class="student-usn">${utils.sanitizeText(s.usn)}</span>
                    <span class="attendance-time">${utils.getRelativeTime(s.timestamp)}</span>
                </div>
                <button class="remove-btn" data-usn="${s.usn}">&times;</button>
            </li>`).join('');
    },
    renderStudentListForSelection: (filter = '') => {
        const listEl = document.getElementById('student-list');
        if(!listEl) return;
        const lowerFilter = filter.toLowerCase();
        const filtered = allStudents.filter(s => s.name.toLowerCase().includes(lowerFilter) || s.usn.toLowerCase().includes(lowerFilter));

        if (filtered.length === 0) {
            listEl.innerHTML = '<div class="loading-students">No students found.</div>';
            return;
        }
        listEl.innerHTML = filtered.map(s => `
            <div class="student-item" data-usn="${s.usn}" role="option">
                <div class="student-info">
                    <div class="student-name">${utils.sanitizeText(s.name)}</div>
                    <div class="student-usn">${utils.sanitizeText(s.usn)}</div>
                </div>
            </div>`).join('');
    },
    
    // ===== MODAL LOGIC =====
    showStartSessionModal: () => {
        const content = `
            <form id="start-session-form">
                <div class="form-group"><label for="session-name">Session Name</label><input type="text" id="session-name" required></div>
                <div class="form-group"><label for="course-select">Course (Optional)</label>
                    <select id="course-select">
                        <option value="">Select a course</option>
                        ${allCourses.map(c => `<option value="${c.id}">${utils.sanitizeText(c.course_name)}</option>`).join('')}
                    </select>
                </div>
                <button type="submit" class="add-manually-btn">Start Session</button>
            </form>`;
        ui.showModal(content, { title: 'Start New Session' });
        
        document.getElementById('start-session-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const sessionName = e.target['session-name'].value;
            const courseId = e.target['course-select'].value || null;
            if(!utils.isValidSessionName(sessionName)) return ui.showToast('Invalid session name', 'error');

            const { data: session, error } = await supabaseClient.from('sessions').insert({ session_name: sessionName, course_id: courseId }).select('*, courses(course_name, course_id)').single();
            if (error) return ui.showToast(error.message, 'error');
            
            sessions.updateActiveSession(session);
            ui.hideModal();
            ui.showToast('Session started!', 'success');
        });
    },

    showStudentsModal: async () => {
        await data.fetchAllStudents();
        const studentRows = allStudents.map(s => `
            <div class="student-item">
                <div class="student-info">
                    <span class="student-name">${utils.sanitizeText(s.name)}</span>
                    <span class="student-usn">${utils.sanitizeText(s.usn)}</span>
                </div>
                <button class="delete-student-btn" data-usn="${s.usn}">Delete</button>
            </div>`).join('');

        const content = `
            <form id="add-student-form" style="display:flex; gap:10px; margin-bottom:20px;">
                <input type="text" name="name" placeholder="Full Name" required style="flex:2">
                <input type="text" name="usn" placeholder="USN" required style="flex:1">
                <button type="submit">Add</button>
            </form>
            <div class="student-list-display">${studentRows}</div>`;
        ui.showModal(content, { title: `Manage Students (${allStudents.length})` });

        document.getElementById('add-student-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = e.target.name.value;
            const usn = e.target.usn.value;
            if(!utils.isValidName(name) || !utils.isValidUSN(usn)) return ui.showToast('Invalid name or USN', 'error');
            
            await actions.addStudent(name, usn);
            pages.showStudentsModal(); // Refresh the modal
        });
    },

    showCoursesModal: async () => {
        await data.fetchAllCourses();
         const courseRows = allCourses.map(c => `
            <div class="student-item">
                <div class="student-info">
                    <span class="student-name">${utils.sanitizeText(c.course_name)}</span>
                    <span class="student-usn">${utils.sanitizeText(c.course_id)}</span>
                </div>
                <button class="delete-course-btn" data-id="${c.id}">Delete</button>
            </div>`).join('');

        const content = `
            <form id="add-course-form" style="display:flex; gap:10px; margin-bottom:20px;">
                <input type="text" name="course_name" placeholder="Course Name" required style="flex:2">
                <input type="text" name="course_id" placeholder="Course ID" required style="flex:1">
                <button type="submit">Add</button>
            </form>
            <div class="course-list-display">${courseRows}</div>`;
        ui.showModal(content, { title: `Manage Courses (${allCourses.length})` });

        document.getElementById('add-course-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = e.target.course_name.value;
            const id = e.target.course_id.value;
            await actions.addCourse(name, id);
            pages.showCoursesModal(); // Refresh
        });
    },

    showSessionHistoryModal: async () => {
        await data.fetchAllSessions();
        const sessionRows = allSessions.map(s => `
             <div class="student-item">
                <div class="student-info">
                    <span class="student-name">${utils.sanitizeText(s.session_name)} (${s.attendance_count} students)</span>
                    <span class="student-usn">${s.courses?.course_name || 'General'} - ${utils.formatTimestamp(s.created_at)}</span>
                </div>
                <button class="activate-session-btn" data-id="${s.id}">Activate</button>
            </div>
        `).join('');
        ui.showModal(sessionRows, {title: 'Session History'});
    },

    // ===== ACTIONS & SUBMISSIONS =====
    handleStudentAttendanceSubmit: async () => {
        if (!selectedStudentForAttendance || !currentSession) {
            return ui.showToast('Please select your name first.', 'warning');
        }
        const btn = document.getElementById('submit-attendance');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        try {
            await actions.markAttendance(selectedStudentForAttendance.name, selectedStudentForAttendance.usn);
            document.getElementById('student-selection-page').style.display = 'none';
            const successPage = document.getElementById('success-page');
            successPage.style.display = 'block';
            successPage.querySelector('#success-student-name').textContent = selectedStudentForAttendance.name;
            successPage.querySelector('#success-timestamp').textContent = utils.formatTimestamp(new Date());

        } catch(error) {
            ui.showToast(error.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Attendance';
        }
    },
    exportCurrentSessionData: async () => {
        if(!currentSession) return ui.showToast('No active session.', 'warning');
        const records = await data.fetchCurrentSessionAttendance();
        if(records.length === 0) return ui.showToast('No attendance to export.', 'info');
        const filename = `attendance_${currentSession.session_name}_${new Date().toISOString().split('T')[0]}.csv`;
        utils.downloadCSV(records, filename);
    },
};

const actions = {
    addStudent: async (name, usn) => {
        const { error } = await supabaseClient.from('students').insert({ name, usn });
        if (error) ui.showToast(error.message, 'error');
        else ui.showToast('Student added!', 'success');
    },
    deleteStudent: async (usn) => {
        const { error } = await supabaseClient.from('students').delete().eq('usn', usn);
        if (error) ui.showToast(error.message, 'error');
        else ui.showToast('Student deleted!', 'success');
    },
    addCourse: async (course_name, course_id) => {
        const { error } = await supabaseClient.from('courses').insert({ course_name, course_id });
        if (error) ui.showToast(error.message, 'error');
        else ui.showToast('Course added!', 'success');
    },
    deleteCourse: async (id) => {
        const { error } = await supabaseClient.from('courses').delete().eq('id', id);
        if (error) ui.showToast(error.message, 'error');
        else ui.showToast('Course deleted!', 'success');
    },
    markAttendance: async (student, usn) => {
        const { data: existing, error: checkError } = await supabaseClient.from('attendance').select('id').eq('session_id', currentSession.id).eq('usn', usn).maybeSingle();
        if(checkError) throw checkError;
        if(existing) throw new Error('You have already marked your attendance.');

        const { error } = await supabaseClient.from('attendance').insert({
            session_id: currentSession.id,
            student,
            usn
        });
        if (error) throw error;
    },
    removeAttendance: async (usn) => {
        const { error } = await supabaseClient.from('attendance').delete().eq('session_id', currentSession.id).eq('usn', usn);
        if(error) ui.showToast(error.message, 'error');
        else ui.showToast('Attendance removed', 'success');
    }
};

// ===== MAIN INITIALIZATION =====
document.addEventListener('DOMContentLoaded', pages.init);
