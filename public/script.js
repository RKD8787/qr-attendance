// ===== QR ATTENDANCE SYSTEM - FIXED SCRIPT.JS =====

// Global Supabase client
let supabaseClient = null;

// Global state variables
let allStudents = [];
let presentStudents = [];
let currentCourseId = null;
let currentSession = null;
let allSessions = [];
let allCourses = [];
let attendanceChart = null;
let verificationChart = null;
let selectedStudentForAttendance = null;

// Performance and caching
let studentsCache = new Map();
let coursesCache = new Map();
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Network and retry logic
let retryCount = 0;
const MAX_RETRIES = 3;
let isOnline = navigator.onLine;

// Realtime subscriptions
let attendanceSubscription = null;
let studentSubscription = null;

// ===== INITIALIZATION =====

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    console.log('🚀 Initializing QR Attendance System...');

    try {
        // Initialize Supabase client
        await initializeSupabase();

        // Determine which page we're on and initialize accordingly
        const currentPath = window.location.pathname;

        if (currentPath.includes('student.html')) {
            await initStudentView();
        } else if (currentPath.includes('login.html')) {
            await initLoginView();
        } else {
            // Default to faculty view (index.html)
            await initFacultyView();
        }

        console.log('✅ Application initialized successfully');

    } catch (error) {
        console.error('❌ Fatal initialization error:', error);
        showToast('Failed to initialize application. Please refresh the page.', 'error');

        // Show a user-friendly error message
        displayFatalError(error);
    }
}

async function initializeSupabase() {
    try {
        const SUPABASE_URL = 'https://zpesqzstorixfsmpntsx.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ';

        if (!window.supabase) {
            throw new Error('Supabase library not loaded');
        }

        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        // Test connection
        await testDatabaseConnection();
        console.log('✅ Supabase client initialized and tested');

    } catch (error) {
        console.error('❌ Supabase initialization failed:', error);
        throw new Error(`Database connection failed: ${error.message}`);
    }
}

async function testDatabaseConnection() {
    try {
        const { data, error } = await supabaseClient
            .from('students')
            .select('count')
            .limit(1);

        if (error) {
            throw error;
        }

        return true;
    } catch (error) {
        console.error('Database connection test failed:', error);
        throw new Error('Database connection test failed');
    }
}

// ===== FACULTY VIEW INITIALIZATION =====

async function initFacultyView() {
    try {
        console.log('📚 Initializing faculty view...');

        // Load initial data
        await Promise.all([
            fetchAllStudents(),
            fetchAllCourses()
        ]);

        console.log(`📊 Data loaded: ${allStudents.length} students, ${allCourses.length} courses`);

        // Initialize UI components
        setupKeyboardShortcuts();
        setupNetworkMonitoring();
        setupModalEventListeners();

        // Check for existing session
        await restoreActiveSession();

        // Setup real-time subscriptions
        setupRealtimeSubscriptions();

        // Start periodic refresh
        startPeriodicRefresh();

        console.log('✅ Faculty view initialized successfully');

    } catch (error) {
        console.error('❌ Faculty view initialization failed:', error);
        showToast('Failed to initialize dashboard', 'error');
    }
}

async function restoreActiveSession() {
    try {
        const lastSessionId = localStorage.getItem('sessionId');

        if (lastSessionId && lastSessionId !== 'null') {
            console.log('🔄 Restoring session:', lastSessionId);

            const { data, error } = await supabaseClient
                .from('sessions')
                .select(`
                    *,
                    courses(course_name, course_id)
                `)
                .eq('id', lastSessionId)
                .single();

            if (data && !error) {
                console.log('✅ Session restored:', data.session_name);
                updateActiveSession(data);
                showToast(`Session "${data.session_name}" restored`, 'success');
            } else {
                console.log('⚠️ Session not found or expired');
                updateActiveSession(null);
                localStorage.removeItem('sessionId');
            }
        } else {
            updateActiveSession(null);
        }
    } catch (error) {
        console.error('❌ Error restoring session:', error);
        updateActiveSession(null);
        localStorage.removeItem('sessionId');
    }
}

// ===== STUDENT VIEW INITIALIZATION =====

async function initStudentView() {
    try {
        console.log('🎓 Initializing student view...');

        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session');

        if (!sessionId) {
            showErrorPage('No session ID provided. Please scan a valid QR code.');
            return;
        }

        await fetchAllStudents();
        await loadSessionForStudent(sessionId);
        setupStudentSearch();

        console.log('✅ Student view initialized successfully');

    } catch (error) {
        console.error('❌ Student view initialization failed:', error);
        showErrorPage('Failed to initialize student view.');
    }
}

async function loadSessionForStudent(sessionId) {
    try {
        const { data: sessionData, error } = await supabaseClient
            .from('sessions')
            .select(`
                *,
                courses(course_name, course_id)
            `)
            .eq('id', sessionId)
            .single();

        if (error) throw error;

        if (!sessionData) {
            showErrorPage('Session not found. Please scan a valid QR code.');
            return;
        }

        currentSession = sessionData;
        updateSessionDisplay(sessionData);
        populateStudentListForAttendance();

    } catch (err) {
        console.error('Error loading session:', err);
        showErrorPage('Failed to load session information.');
    }
}

// ===== LOGIN VIEW INITIALIZATION =====

async function initLoginView() {
    console.log('🔐 Initializing login view...');
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            window.location.href = 'index.html';
            return; // Exit if already logged in
        }

        setupLoginForm();
        setupForgotPasswordForm();
        addLoginStyles();
    } catch (error) {
        console.error('Login view initialization error:', error);
        showToast('Failed to initialize login system', 'error');
    }
}

// ===== DATA FETCHING FUNCTIONS =====

async function fetchAllStudents() {
    try {
        console.log('👥 Fetching students...');

        // Check cache first
        const now = Date.now();
        if (studentsCache.has('students') && (now - lastFetchTime) < CACHE_DURATION) {
            allStudents = studentsCache.get('students');
            console.log(`📋 Using cached students: ${allStudents.length}`);
            return allStudents;
        }

        const operation = async () => {
            const { data, error } = await supabaseClient
                .from('students')
                .select('name, usn')
                .order('name', { ascending: true });

            if (error) throw error;
            return data || [];
        };

        const students = await executeWithRetry(operation);
        allStudents = students;

        // Update cache
        studentsCache.set('students', students);
        lastFetchTime = now;

        console.log(`✅ Students fetched: ${students.length}`);
        return students;

    } catch (err) {
        console.error('❌ Error fetching students:', err);

        // Fall back to cached data if available
        if (studentsCache.has('students')) {
            allStudents = studentsCache.get('students');
            showToast('Using cached student data', 'info');
        } else {
            allStudents = [];
            showToast('Failed to load students', 'error');
        }
        return allStudents;
    }
}

async function fetchAllCourses() {
    try {
        console.log('📚 Fetching courses...');

        // Check cache first
        if (coursesCache.has('courses')) {
            allCourses = coursesCache.get('courses');
            console.log(`📋 Using cached courses: ${allCourses.length}`);
            return allCourses;
        }

        const operation = async () => {
            const { data, error } = await supabaseClient
                .from('courses')
                .select('*')
                .order('course_name', { ascending: true });

            if (error) throw error;
            return data || [];
        };

        allCourses = await executeWithRetry(operation);

        // Update cache
        coursesCache.set('courses', allCourses);

        console.log(`✅ Courses fetched: ${allCourses.length}`);
        return allCourses;

    } catch (err) {
        console.error('❌ Error fetching courses:', err);
        allCourses = [];
        showToast('Failed to load courses', 'error');
        return [];
    }
}

async function fetchCurrentSessionAttendance() {
    if (!currentSession) {
        updatePresentStudentsList([]);
        return [];
    }

    try {
        console.log('📊 Fetching attendance for session:', currentSession.session_name);

        const operation = async () => {
            const { data, error } = await supabaseClient
                .from('attendance')
                .select('student, usn, timestamp, fingerprint_verified, location_verified')
                .eq('session_id', currentSession.id)
                .order('timestamp', { ascending: false });

            if (error) throw error;
            return data || [];
        };

        const attendanceData = await executeWithRetry(operation);
        presentStudents = attendanceData.map(record => record.student);
        updatePresentStudentsList(attendanceData);

        console.log(`✅ Attendance data: ${attendanceData.length} records`);
        return attendanceData;

    } catch (err) {
        console.error('❌ Error fetching attendance:', err);
        if (isOnline) {
            showToast('Failed to refresh attendance data', 'error');
        }
        return [];
    }
}

async function fetchAllSessions(includeArchived = false) {
    try {
        console.log('📅 Fetching sessions...');

        const operation = async () => {
            let query = supabaseClient
                .from('sessions')
                .select(`
                    *,
                    courses(course_name, course_id)
                `)
                .order('created_at', { ascending: false });

            if (!includeArchived) {
                query = query.is('archived', false);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        };

        allSessions = await executeWithRetry(operation);

        // Get attendance counts for each session
        await Promise.all(allSessions.map(async (session) => {
            try {
                const { count, error } = await supabaseClient
                    .from('attendance')
                    .select('*', { count: 'exact', head: true })
                    .eq('session_id', session.id);

                if (!error) {
                    session.attendance_count = count || 0;
                }
            } catch (err) {
                console.warn(`Failed to get attendance count for session ${session.id}:`, err);
                session.attendance_count = 0;
            }
        }));

        console.log(`✅ Sessions fetched: ${allSessions.length}`);
        return allSessions;

    } catch (err) {
        console.error('❌ Error fetching sessions:', err);
        allSessions = [];
        showToast('Failed to load session history', 'error');
        return [];
    }
}

// ===== SESSION MANAGEMENT =====

function updateActiveSession(sessionData) {
    console.log('🔄 Updating active session:', sessionData?.session_name || 'None');

    currentSession = sessionData;
    const qrContainer = document.getElementById('qr-code-container');
    const sessionTitle = document.getElementById('current-session-title');

    if (sessionData) {
        // Save session to localStorage
        localStorage.setItem('sessionId', sessionData.id);

        // Update UI
        const courseName = sessionData.courses ? sessionData.courses.course_name : 'General';
        const courseId = sessionData.courses ? sessionData.courses.course_id : '';

        if (sessionTitle) {
            sessionTitle.innerHTML = `
                <i class="fas fa-play-circle" style="color: #28a745;"></i>
                Active: ${sessionData.session_name} (${courseName} ${courseId})
            `.trim();
        }

        // Generate QR code
        generateQR(sessionData.id);

        // Fetch current attendance
        fetchCurrentSessionAttendance();

    } else {
        // Clear session
        localStorage.removeItem('sessionId');

        if (sessionTitle) {
            sessionTitle.innerHTML = `
                <i class="fas fa-pause-circle" style="color: #dc3545;"></i>
                No Active Session
            `;
        }

        if (qrContainer) {
            qrContainer.innerHTML = `
                <div class="no-session-message">
                    <i class="fas fa-qrcode" style="font-size: 3rem; color: #dee2e6; margin-bottom: 15px;"></i>
                    <p>Start a new session to generate a QR code</p>
                </div>
            `;
        }

        updatePresentStudentsList([]);
    }
}

function generateQR(sessionId) {
    const qrContainer = document.getElementById('qr-code-container');
    if (!qrContainer) {
        console.error('❌ QR container not found');
        return;
    }

    qrContainer.innerHTML = '<div class="qr-loading">Generating QR code...</div>';

    try {
        const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;
        console.log('🔗 QR URL:', studentUrl);

        // Validate required components
        if (!sessionId || !window.QRious) {
            throw new Error('Missing QR generation requirements');
        }

        const canvas = document.createElement('canvas');
        qrContainer.innerHTML = '';
        qrContainer.appendChild(canvas);

        const qr = new window.QRious({
            element: canvas,
            value: studentUrl,
            size: 250,
            background: 'white',
            foreground: 'black',
            level: 'M',
            padding: 10
        });

        // Add session info and controls
        const infoDiv = document.createElement('div');
        infoDiv.className = 'qr-info';
        infoDiv.innerHTML = `
            <div class="qr-session-info">
                <h4>Session: ${currentSession?.session_name || 'Unknown'}</h4>
                <p>Students can scan this QR code to mark attendance</p>
            </div>
            <div class="qr-url-display">
                <small>Direct link for manual access:</small>
                <div class="url-input-group">
                    <input type="text" value="${studentUrl}" readonly onclick="this.select()" aria-label="Session URL">
                    <button onclick="copyToClipboard('${studentUrl}')" title="Copy link">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button onclick="openInNewTab('${studentUrl}')" title="Open in new tab">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                </div>
            </div>
        `;
        qrContainer.appendChild(infoDiv);

        console.log('✅ QR code generated successfully');

    } catch (error) {
        console.error('❌ QR generation error:', error);
        qrContainer.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle" style="color: #dc3545; font-size: 2rem; margin-bottom: 10px;"></i>
                <p style="color: #dc3545; margin-bottom: 15px;">Failed to generate QR code</p>
                <button class="retry-btn" onclick="generateQR('${sessionId}')">
                    <i class="fas fa-redo"></i> Retry
                </button>
                <div class="error-details">
                    <small>Error: ${error.message}</small>
                </div>
            </div>
        `;
    }
}

// ===== UI UPDATE FUNCTIONS =====

function updatePresentStudentsList(attendanceData) {
    const listElement = document.getElementById('present-students-list');
    updatePresentCount(attendanceData.length);

    if (!listElement) {
        console.error('❌ Present students list element not found');
        return;
    }

    listElement.innerHTML = '';

    if (attendanceData.length === 0) {
        listElement.innerHTML = `
            <div class="no-students-message">
                <i class="fas fa-users" style="font-size: 2rem; color: #dee2e6; margin-bottom: 10px;"></i>
                <p>No students present yet</p>
            </div>
        `;
        return;
    }

    attendanceData.forEach(record => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-item';

        const badges = [];
        if (record.fingerprint_verified) {
            badges.push('<span class="badge fingerprint-badge">🔐 Fingerprint</span>');
        }
        if (record.location_verified) {
            badges.push('<span class="badge location-badge">📍 Location</span>');
        }

        const timeAgo = getTimeAgo(new Date(record.timestamp));

        studentDiv.innerHTML = `
            <div class="student-info">
                <div class="student-name">${escapeHtml(record.student)}</div>
                <div class="student-usn">${escapeHtml(record.usn)}</div>
                <div class="attendance-time">${timeAgo}</div>
                <div class="student-badges">${badges.join('')}</div>
            </div>
            <button class="remove-btn" onclick="removeStudentFromSession('${escapeHtml(record.student)}', '${escapeHtml(record.usn)}')" title="Remove student">
                <i class="fas fa-times"></i>
            </button>
        `;

        listElement.appendChild(studentDiv);
    });

    console.log(`✅ Present students list updated: ${attendanceData.length} students`);
}

function updatePresentCount(count) {
    const countElement = document.getElementById('present-count');
    if (countElement) {
        countElement.textContent = count;
    }
}

// ===== MODAL FUNCTIONS =====

function showCourseSelectionModal() {
    console.log('🚀 Showing course selection modal...');

    if (allCourses.length === 0) {
        showToast('No courses found. Please create a course first.', 'error');
        showCoursesModal(); // Allow user to create a course
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-rocket"></i> Start New Session</h3>
                <button class="close-btn" onclick="this.closest('.modal').remove()" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="session-name-input">
                        <i class="fas fa-tag"></i> Session Name
                    </label>
                    <input type="text" id="session-name-input" placeholder="Enter session name (e.g., Morning Lecture)" required>
                </div>
                <div class="form-group">
                    <label for="course-select">
                        <i class="fas fa-book"></i> Select Course
                    </label>
                    <select id="course-select" required>
                        <option value="">Choose a course...</option>
                        ${allCourses.map(course =>
                            `<option value="${course.id}">${escapeHtml(course.course_name)} (${escapeHtml(course.course_id)})</option>`
                        ).join('')}
                    </select>
                </div>
                <button class="add-student-btn" onclick="createNewSession()">
                    <i class="fas fa-play"></i> Start Session
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Focus on session name input
    setTimeout(() => {
        const sessionNameInput = document.getElementById('session-name-input');
        if (sessionNameInput) {
            sessionNameInput.focus();
        }
    }, 100);

    // Close modal on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // Close modal on escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

async function createNewSession() {
    console.log('✨ Creating new session...');

    const sessionName = document.getElementById('session-name-input')?.value.trim();
    const courseId = document.getElementById('course-select')?.value;
    const submitButton = document.querySelector('.add-student-btn');

    // Validation
    if (!sessionName) {
        showToast('Please enter a session name', 'error');
        document.getElementById('session-name-input')?.focus();
        return;
    }

    if (!courseId) {
        showToast('Please select a course', 'error');
        document.getElementById('course-select')?.focus();
        return;
    }

    // Show loading state
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<div class="loading"></div> Creating Session...';
    }

    try {
        const { data, error } = await supabaseClient
            .from('sessions')
            .insert([{
                session_name: sessionName,
                course_id: courseId,
                created_at: new Date().toISOString(),
                archived: false
            }])
            .select(`
                *,
                courses(course_name, course_id)
            `)
            .single();

        if (error) throw error;

        console.log('✅ Session created:', data.session_name);
        updateActiveSession(data);
        showToast(`Session "${sessionName}" started successfully!`, 'success');

        // Close modal
        document.querySelector('.modal')?.remove();

    } catch (err) {
        console.error('❌ Error creating session:', err);
        showToast(`Failed to create session: ${err.message}`, 'error');
    } finally {
        // Reset button state
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-play"></i> Start Session';
        }
    }
}

function showSessionHistoryModal() {
    console.log('📅 Showing session history modal...');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content student-list-modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-history"></i> Session History</h3>
                <button class="close-btn" onclick="this.closest('.modal').remove()" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="session-toolbar">
                    <div class="search-container">
                        <input type="text"
                               id="session-history-search"
                               placeholder="Search sessions..."
                               autocomplete="off">
                        <div class="search-icon">🔍</div>
                    </div>
                    <div class="toolbar-controls">
                        <label for="show-archived" class="checkbox-label">
                            <input type="checkbox" id="show-archived" onchange="refreshSessionHistory()">
                            <span class="checkmark"></span>
                            Show Archived
                        </label>
                    </div>
                </div>
                <div id="session-list-display" class="student-list-display" role="list">
                    <div class="loading-container">
                        <div class="loading"></div>
                        <p>Loading sessions...</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Load sessions
    refreshSessionHistory();

    // Setup search
    const searchInput = document.getElementById('session-history-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterSessionHistory(e.target.value.toLowerCase().trim());
        });
    }

    // Close modal handlers
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function refreshSessionHistory() {
    const includeArchived = document.getElementById('show-archived')?.checked || false;
    const sessions = await fetchAllSessions(includeArchived);
    populateSessionHistoryList(sessions);
}

function populateSessionHistoryList(sessions = allSessions) {
    const listElement = document.getElementById('session-list-display');
    if (!listElement) return;

    if (sessions.length === 0) {
        listElement.innerHTML = `
            <div class="no-results">
                <i class="fas fa-history" style="font-size: 2rem; color: #dee2e6; margin-bottom: 10px;"></i>
                <p>No sessions found</p>
                <button class="add-student-btn" onclick="showCourseSelectionModal(); document.querySelector('.modal').remove();">
                    <i class="fas fa-plus"></i> Create First Session
                </button>
            </div>
        `;
        return;
    }

    listElement.innerHTML = '';

    sessions.forEach(session => {
        const sessionDiv = document.createElement('div');
        sessionDiv.className = 'session-history-item';

        const courseName = session.courses ? session.courses.course_name : 'General';
        const courseId = session.courses ? session.courses.course_id : '';
        const createdDate = new Date(session.created_at).toLocaleString();
        const attendanceCount = session.attendance_count || 0;

        sessionDiv.innerHTML = `
            <div class="session-info">
                <div class="session-name">${escapeHtml(session.session_name)}</div>
                <div class="session-course">${escapeHtml(courseName)} ${escapeHtml(courseId)}</div>
                <div class="session-date">${createdDate}</div>
                <div class="session-stats">
                    <span class="attendance-count">
                        <i class="fas fa-users"></i> ${attendanceCount} students
                    </span>
                </div>
            </div>
            <div class="session-actions">
                <button class="view-btn" onclick="viewSessionDetails('${session.id}')" title="View details">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="export-btn" onclick="exportSessionCSV('${session.id}')" title="Export CSV">
                    <i class="fas fa-download"></i>
                </button>
                <button class="remove-btn" onclick="deleteSession('${session.id}', '${escapeHtml(session.session_name)}')" title="Delete session">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        listElement.appendChild(sessionDiv);
    });
}

function filterSessionHistory(searchTerm) {
    const sessionItems = document.querySelectorAll('.session-history-item');

    sessionItems.forEach(item => {
        const sessionName = item.querySelector('.session-name')?.textContent.toLowerCase() || '';
        const courseName = item.querySelector('.session-course')?.textContent.toLowerCase() || '';

        if (sessionName.includes(searchTerm) || courseName.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function showStatisticsModal() {
    console.log('📊 Showing statistics modal...');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1200px; max-height: 95vh;">
            <div class="modal-header">
                <h3><i class="fas fa-chart-line"></i> Attendance Statistics</h3>
                <button class="close-btn" onclick="this.closest('.modal').remove()" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="stats-tabs" role="tablist">
                    <button class="stats-tab-btn active" onclick="showStatsTab('overview')" role="tab">
                        📊 Overview
                    </button>
                    <button class="stats-tab-btn" onclick="showStatsTab('students')" role="tab">
                        🧑‍🎓 Students
                    </button>
                </div>

                <div id="stats-overview-view" class="stats-view active" role="tabpanel">
                    <div class="overview-grid">
                        <div class="stat-card">
                            <h4>Total Attendance</h4>
                            <p id="stats-total-attendance">Loading...</p>
                        </div>
                        <div class="stat-card">
                            <h4>Average Attendance</h4>
                            <p id="stats-avg-attendance">Loading...</p>
                        </div>
                        <div class="stat-card">
                            <h4>Total Sessions</h4>
                            <p id="stats-total-sessions">Loading...</p>
                        </div>
                        <div class="stat-card">
                            <h4>Fully Verified</h4>
                            <p id="stats-fully-verified">Loading...</p>
                        </div>
                    </div>

                    <div class="charts-grid">
                        <div class="chart-container">
                            <h4>Attendance Trend (Last 30 Days)</h4>
                            <canvas id="attendance-trend-chart" aria-label="Attendance trend chart"></canvas>
                        </div>
                        <div class="chart-container">
                            <h4>Verification Methods</h4>
                            <canvas id="verification-method-chart" aria-label="Verification methods chart"></canvas>
                        </div>
                    </div>
                </div>

                <div id="stats-students-view" class="stats-view" role="tabpanel">
                    <div class="stats-toolbar">
                        <input type="text"
                               id="student-stats-search"
                               class="stats-search"
                               placeholder="Search students by name or USN..."
                               autocomplete="off">
                    </div>
                    <div class="stats-list-display" id="student-stats-list" role="list">
                        <div class="loading-container">
                            <div class="loading"></div>
                            <p>Loading student statistics...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Load initial statistics
    showStatsTab('overview');

    // Close modal handlers
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function showStatsTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.stats-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.querySelectorAll('.stats-view').forEach(view => {
        view.classList.remove('active');
    });

    // Activate selected tab
    const activeBtn = document.querySelector(`[onclick="showStatsTab('${tabName}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    const activeView = document.getElementById(`stats-${tabName}-view`);
    if (activeView) {
        activeView.classList.add('active');
    }

    // Load appropriate data
    if (tabName === 'overview') {
        loadOverviewStatistics();
    } else if (tabName === 'students') {
        fetchStudentStatistics();
    }
}

async function loadOverviewStatistics() {
    try {
        // Fetch attendance data
        const { data: attendanceData, error: attendanceError } = await supabaseClient
            .from('attendance')
            .select('*');

        if (attendanceError) throw attendanceError;

        // Fetch sessions data
        const { data: sessionsData, error: sessionsError } = await supabaseClient
            .from('sessions')
            .select('*');

        if (sessionsError) throw sessionsError;

        // Calculate statistics
        const totalAttendance = attendanceData.length;
        const totalSessions = sessionsData.length;
        const avgAttendance = totalSessions > 0 ? Math.round((totalAttendance / totalSessions) * 100) / 100 : 0;
        const fullyVerified = attendanceData.filter(a => a.fingerprint_verified && a.location_verified).length;
        const fullyVerifiedPercent = totalAttendance > 0 ? Math.round((fullyVerified / totalAttendance) * 100) : 0;

        // Update overview cards
        const elements = {
            'stats-total-attendance': totalAttendance,
            'stats-avg-attendance': `${avgAttendance}%`,
            'stats-total-sessions': totalSessions,
            'stats-fully-verified': `${fullyVerifiedPercent}%`
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });

        // Generate charts
        generateAttendanceTrendChart(attendanceData);
        generateVerificationMethodChart(attendanceData);

    } catch (err) {
        console.error('❌ Error loading statistics:', err);
        showToast('Failed to load statistics', 'error');
    }
}

function showAddManuallyModal() {
    if (!currentSession) {
        showToast('Please start a session first', 'error');
        return;
    }

    console.log('➕ Showing add manually modal...');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-user-plus"></i> Add Student Manually</h3>
                <button class="close-btn" onclick="this.closest('.modal').remove()" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="search-container">
                    <input type="text"
                           id="student-search-manual"
                           placeholder="Search for students not yet present..."
                           autocomplete="off"
                           aria-label="Search students">
                    <div class="search-icon">🔍</div>
                </div>
                <div class="student-dropdown" id="student-dropdown" role="listbox">
                    <div class="loading-container">
                        <div class="loading"></div>
                        <p>Loading available students...</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Load available students
    populateFacultyStudentDropdown();

    // Setup search
    const searchInput = document.getElementById('student-search-manual');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            populateFacultyStudentDropdown(e.target.value.toLowerCase().trim());
        });
        searchInput.focus();
    }

    // Close modal handlers
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function populateFacultyStudentDropdown(searchTerm = '') {
    const dropdownElement = document.getElementById('student-dropdown');
    if (!dropdownElement) return;

    // Filter out students who are already present
    const availableStudents = allStudents.filter(student =>
        !presentStudents.includes(student.name) &&
        (searchTerm === '' ||
         student.name.toLowerCase().includes(searchTerm) ||
         student.usn.toLowerCase().includes(searchTerm))
    );

    dropdownElement.innerHTML = '';

    if (availableStudents.length === 0) {
        dropdownElement.innerHTML = `
            <div class="no-students-available">
                <i class="fas fa-users" style="font-size: 2rem; color: #dee2e6; margin-bottom: 10px;"></i>
                <p>No students available to add</p>
                ${searchTerm ? '<small>Try adjusting your search terms</small>' : ''}
            </div>
        `;
        return;
    }

    availableStudents.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'dropdown-student-item';
        studentDiv.innerHTML = `
            <div class="student-info">
                <div class="student-name">${escapeHtml(student.name)}</div>
                <div class="student-usn">${escapeHtml(student.usn)}</div>
            </div>
            <button class="add-student-manual-btn" onclick="addStudentManually('${escapeHtml(student.name)}', '${escapeHtml(student.usn)}')">
                <i class="fas fa-plus"></i> Add
            </button>
        `;
        dropdownElement.appendChild(studentDiv);
    });
}

async function addStudentManually(studentName, usn) {
    console.log('✋ Adding student manually:', studentName);

    if (!currentSession) {
        showToast('No active session', 'error');
        return;
    }

    const button = event.target.closest('.add-student-manual-btn');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<div class="loading"></div> Adding...';
    }

    try {
        // Check if student already marked attendance
        const { data: existingAttendance } = await supabaseClient
            .from('attendance')
            .select('*')
            .eq('session_id', currentSession.id)
            .eq('usn', usn)
            .single();

        if (existingAttendance) {
            showToast('Student already marked present', 'error');
            return;
        }

        // Add attendance record
        const { error } = await supabaseClient
            .from('attendance')
            .insert([{
                session_id: currentSession.id,
                student: studentName,
                usn: usn,
                timestamp: new Date().toISOString(),
                fingerprint_verified: false,
                location_verified: false
            }]);

        if (error) throw error;

        showToast(`${studentName} added successfully!`, 'success');
        fetchCurrentSessionAttendance();
        populateFacultyStudentDropdown();

    } catch (err) {
        console.error('❌ Error adding student manually:', err);
        showToast('Failed to add student', 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-plus"></i> Add';
        }
    }
}

function showStudentListModal() {
    console.log('👥 Showing student list modal...');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content student-list-modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-users"></i> Manage Student Roster</h3>
                <button class="close-btn" onclick="this.closest('.modal').remove()" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="add-student-section">
                    <h4><i class="fas fa-plus-circle"></i> Add New Student</h4>
                    <div class="add-student-form">
                        <input type="text"
                               id="new-student-name"
                               placeholder="Student Name"
                               maxlength="50"
                               aria-label="Student Name"
                               required>
                        <input type="text"
                               id="new-student-usn"
                               placeholder="Unique Student Number (USN)"
                               maxlength="20"
                               aria-label="Student USN"
                               required>
                        <button class="add-student-btn" onclick="addNewStudent()">
                            <i class="fas fa-plus"></i> Add Student
                        </button>
                    </div>
                </div>

                <div class="search-container">
                    <input type="text"
                           id="student-list-search"
                           placeholder="Search all students..."
                           autocomplete="off"
                           aria-label="Search students">
                    <div class="search-icon">🔍</div>
                </div>

                <div class="student-list-container">
                    <div class="student-count-header">
                        <i class="fas fa-users"></i>
                        Total Students: <span id="total-student-count">${allStudents.length}</span>
                    </div>
                    <div class="student-list-display" id="student-list-display" role="list">
                        <div class="loading-container">
                            <div class="loading"></div>
                            <p>Loading students...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Load students
    populateStudentListDisplay();

    // Setup search
    const searchInput = document.getElementById('student-list-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterStudentList(e.target.value.toLowerCase().trim());
        });
    }

    // Close modal handlers
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function populateStudentListDisplay(searchTerm = '') {
    const listElement = document.getElementById('student-list-display');
    const countElement = document.getElementById('total-student-count');

    if (!listElement) return;

    if (countElement) {
        countElement.textContent = allStudents.length;
    }

    const filteredStudents = allStudents.filter(student =>
        searchTerm === '' ||
        student.name.toLowerCase().includes(searchTerm) ||
        student.usn.toLowerCase().includes(searchTerm)
    );

    if (filteredStudents.length === 0) {
        listElement.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search" style="font-size: 2rem; color: #dee2e6; margin-bottom: 10px;"></i>
                <p>No students found</p>
                ${allStudents.length === 0 ? '<button class="add-student-btn" onclick="document.getElementById(\'new-student-name\').focus()"><i class="fas fa-plus"></i> Add First Student</button>' : ''}
            </div>
        `;
        return;
    }

    listElement.innerHTML = '';

    filteredStudents.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-list-item';
        studentDiv.innerHTML = `
            <div class="student-info">
                <div class="student-name">${escapeHtml(student.name)}</div>
                <div class="student-usn">${escapeHtml(student.usn)}</div>
            </div>
            <div class="student-actions">
                <button class="edit-btn" onclick="editStudent('${escapeHtml(student.usn)}', '${escapeHtml(student.name)}')" title="Edit student">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="remove-btn" onclick="deleteStudent('${escapeHtml(student.usn)}', '${escapeHtml(student.name)}')" title="Delete student">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        listElement.appendChild(studentDiv);
    });
}

function filterStudentList(searchTerm) {
    populateStudentListDisplay(searchTerm);
}

async function addNewStudent() {
    console.log('➕ Adding new student...');

    const nameInput = document.getElementById('new-student-name');
    const usnInput = document.getElementById('new-student-usn');
    const submitButton = document.querySelector('.add-student-btn');

    const name = nameInput?.value.trim();
    const usn = usnInput?.value.trim();

    if (!name || !usn) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    // Check if USN already exists
    const existingStudent = allStudents.find(s => s.usn.toLowerCase() === usn.toLowerCase());
    if (existingStudent) {
        showToast('Student with this USN already exists', 'error');
        usnInput?.focus();
        return;
    }

    // Show loading state
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<div class="loading"></div> Adding...';
    }

    try {
        const { error } = await supabaseClient
            .from('students')
            .insert([{ name, usn }]);

        if (error) throw error;

        await fetchAllStudents();
        populateStudentListDisplay();
        showToast('Student added successfully!', 'success');

        // Clear inputs
        if (nameInput) nameInput.value = '';
        if (usnInput) usnInput.value = '';
        nameInput?.focus();

    } catch (err) {
        console.error('❌ Error adding student:', err);
        showToast(`Failed to add student: ${err.message}`, 'error');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-plus"></i> Add Student';
        }
    }
}

async function deleteStudent(usn, name) {
    if (!confirm(`Delete student ${name}? This will also remove all their attendance records.`)) {
        return;
    }

    try {
        // Delete attendance records first
        await supabaseClient.from('attendance').delete().eq('usn', usn);

        // Delete student
        const { error } = await supabaseClient
            .from('students')
            .delete()
            .eq('usn', usn);

        if (error) throw error;

        await fetchAllStudents();
        populateStudentListDisplay();
        showToast('Student deleted successfully', 'success');

    } catch (err) {
        console.error('❌ Error deleting student:', err);
        showToast('Failed to delete student', 'error');
    }
}
function editStudent(usn, name) {
    // Implementation for editing student
    console.log('Edit student:', name, usn);
    showToast('Edit functionality not yet implemented', 'info');
}
function showCoursesModal() {
    console.log('📚 Showing courses modal...');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content student-list-modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-book"></i> Manage Courses</h3>
                <button class="close-btn" onclick="this.closest('.modal').remove()" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="add-student-section">
                    <h4><i class="fas fa-plus-circle"></i> Create New Course</h4>
                    <div class="add-student-form">
                        <input type="text"
                               id="new-course-name"
                               placeholder="Course Name (e.g., Computer Science)"
                               aria-label="Course Name"
                               required>
                        <input type="text"
                               id="new-course-id"
                               placeholder="Course ID (e.g., CS-101)"
                               aria-label="Course ID"
                               required>
                        <button class="add-student-btn" onclick="createNewCourse()">
                            <i class="fas fa-plus"></i> Create Course
                        </button>
                    </div>
                </div>
                <div id="courses-list-display" class="student-list-display" role="list">
                    <div class="loading-container">
                        <div class="loading"></div>
                        <p>Loading courses...</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Load courses
    populateCoursesList();

    // Close modal handlers
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function populateCoursesList() {
    const listElement = document.getElementById('courses-list-display');
    if (!listElement) return;

    await fetchAllCourses();

    if (allCourses.length === 0) {
        listElement.innerHTML = `
            <div class="no-results">
                <i class="fas fa-book" style="font-size: 2rem; color: #dee2e6; margin-bottom: 10px;"></i>
                <p>No courses found</p>
                <button class="add-student-btn" onclick="document.getElementById('new-course-name').focus()">
                    <i class="fas fa-plus"></i> Create First Course
                </button>
            </div>
        `;
        return;
    }

    listElement.innerHTML = '';

    allCourses.forEach(course => {
        const courseDiv = document.createElement('div');
        courseDiv.className = 'course-list-item';
        courseDiv.innerHTML = `
            <div class="course-info">
                <div class="course-name">${escapeHtml(course.course_name)}</div>
                <div class="course-id">${escapeHtml(course.course_id)}</div>
            </div>
            <div class="course-actions">
                <button class="edit-btn" onclick="editCourse('${course.id}', '${escapeHtml(course.course_name)}', '${escapeHtml(course.course_id)}')" title="Edit course">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="remove-btn" onclick="deleteCourse('${course.id}', '${escapeHtml(course.course_name)}')" title="Delete course">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        listElement.appendChild(courseDiv);
    });
}

async function createNewCourse() {
    console.log('➕ Creating new course...');

    const nameInput = document.getElementById('new-course-name');
    const idInput = document.getElementById('new-course-id');
    const submitButton = document.querySelector('.add-student-btn');

    const courseName = nameInput?.value.trim();
    const courseId = idInput?.value.trim();

    if (!courseName || !courseId) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    // Check if course ID already exists
    const existingCourse = allCourses.find(c => c.course_id.toLowerCase() === courseId.toLowerCase());
    if (existingCourse) {
        showToast('Course with this ID already exists', 'error');
        idInput?.focus();
        return;
    }

    // Show loading state
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<div class="loading"></div> Creating...';
    }

    try {
        const { error } = await supabaseClient
            .from('courses')
            .insert([{
                course_name: courseName,
                course_id: courseId
            }]);

        if (error) throw error;

        await fetchAllCourses();
        populateCoursesList();
        showToast('Course created successfully!', 'success');

        // Clear inputs
        if (nameInput) nameInput.value = '';
        if (idInput) idInput.value = '';
        nameInput?.focus();

    } catch (err) {
        console.error('❌ Error creating course:', err);
        showToast(`Failed to create course: ${err.message}`, 'error');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-plus"></i> Create Course';
        }
    }
}

async function deleteCourse(id, courseName) {
    if (!confirm(`Delete course "${courseName}"? This cannot be undone.`)) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('courses')
            .delete()
            .eq('id', id);

        if (error) throw error;

        await fetchAllCourses();
        populateCoursesList();
        showToast('Course deleted successfully', 'success');

    } catch (err) {
        console.error('❌ Error deleting course:', err);
        showToast('Failed to delete course', 'error');
    }
}
function editCourse(id, courseName, courseCode) {
    // Implementation for editing course
    console.log('Edit course:', courseName, courseCode);
    showToast('Edit functionality not yet implemented', 'info');
}
async function viewSessionDetails(sessionId) {
    console.log('👁️ Viewing session details:', sessionId);
    showToast('View session details not yet implemented', 'info');
}
async function deleteSession(sessionId, sessionName) {
    if (!confirm(`Delete session "${sessionName}"? This will also remove all attendance records for this session.`)) {
        return;
    }

    try {
        // Delete attendance records first
        await supabaseClient.from('attendance').delete().eq('session_id', sessionId);

        // Delete session
        const { error } = await supabaseClient
            .from('sessions')
            .delete()
            .eq('id', sessionId);

        if (error) throw error;

        await fetchAllSessions();
        populateSessionHistoryList();
        showToast('Session deleted successfully', 'success');

        // If the deleted session was the current session, clear it
        if (currentSession && currentSession.id === sessionId) {
            updateActiveSession(null);
        }

    } catch (err) {
        console.error('❌ Error deleting session:', err);
        showToast('Failed to delete session', 'error');
    }
}

// ===== EXPORT FUNCTIONS =====

async function exportAttendanceCSV() {
    console.log('📥 Exporting attendance CSV...');

    try {
        showToast('Preparing export...', 'info');

        const { data: attendanceData, error } = await supabaseClient
            .from('attendance')
            .select(`
                *,
                sessions(session_name, courses(course_name, course_id))
            `)
            .order('timestamp', { ascending: false });

        if (error) throw error;

        if (attendanceData.length === 0) {
            showToast('No attendance data to export', 'error');
            return;
        }

        // Convert to CSV
        const csvHeaders = [
            'Student Name',
            'USN',
            'Session',
            'Course',
            'Date',
            'Time',
            'Fingerprint Verified',
            'Location Verified'
        ];

        const csvRows = attendanceData.map(record => [
            record.student,
            record.usn,
            record.sessions?.session_name || 'N/A',
            record.sessions?.courses?.course_name || 'N/A',
            new Date(record.timestamp).toLocaleDateString(),
            new Date(record.timestamp).toLocaleTimeString(),
            record.fingerprint_verified ? 'Yes' : 'No',
            record.location_verified ? 'Yes' : 'No'
        ]);

        const csvContent = [csvHeaders, ...csvRows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        // Download CSV
        downloadCSV(csvContent, `attendance_${new Date().toISOString().split('T')[0]}.csv`);
        showToast('Attendance data exported successfully!', 'success');

    } catch (err) {
        console.error('❌ Error exporting CSV:', err);
        showToast('Failed to export attendance data', 'error');
    }
}

async function exportSessionCSV(sessionId) {
    console.log('📥 Exporting session CSV for:', sessionId);

    try {
        const { data: attendanceData, error } = await supabaseClient
            .from('attendance')
            .select(`
                *,
                sessions(session_name, courses(course_name, course_id))
            `)
            .eq('session_id', sessionId)
            .order('timestamp', { ascending: false });

        if (error) throw error;

        if (attendanceData.length === 0) {
            showToast('No attendance data for this session', 'error');
            return;
        }

        const sessionName = attendanceData[0].sessions?.session_name || 'session';

        // Convert to CSV
        const csvHeaders = [
            'Student Name',
            'USN',
            'Date',
            'Time',
            'Fingerprint Verified',
            'Location Verified'
        ];

        const csvRows = attendanceData.map(record => [
            record.student,
            record.usn,
            new Date(record.timestamp).toLocaleDateString(),
            new Date(record.timestamp).toLocaleTimeString(),
            record.fingerprint_verified ? 'Yes' : 'No',
            record.location_verified ? 'Yes' : 'No'
        ]);

        const csvContent = [csvHeaders, ...csvRows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        // Download CSV
        downloadCSV(csvContent, `${sessionName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendance.csv`);
        showToast('Session data exported successfully!', 'success');

    } catch (err) {
        console.error('❌ Error exporting session CSV:', err);
        showToast('Failed to export session data', 'error');
    }
}

function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}

// ===== UTILITY FUNCTIONS =====

async function executeWithRetry(operation, maxRetries = MAX_RETRIES) {
    let lastError;

    for (let i = 0; i <= maxRetries; i++) {
        try {
            if (!isOnline && i === 0) {
                throw new Error('Offline - operation will be retried when connection is restored');
            }

            const result = await operation();
            retryCount = 0; // Reset on success
            return result;
        } catch (error) {
            lastError = error;
            retryCount = i + 1;

            if (i < maxRetries) {
                const delay = Math.pow(2, i) * 1000; // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
                console.log(`🔄 Retry attempt ${i + 1}/${maxRetries} after ${delay}ms`);
            }
        }
    }

    throw lastError;
}

function setupNetworkMonitoring() {
    window.addEventListener('online', () => {
        isOnline = true;
        retryCount = 0;
        showToast('Connection restored', 'success');
        // Retry failed operations if any
        retryFailedOperations();
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        showToast('Connection lost. Working in offline mode.', 'error');
    });
}

async function retryFailedOperations() {
    if (currentSession) {
        fetchCurrentSessionAttendance();
    }
    fetchAllStudents();
    fetchAllCourses();
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Only trigger shortcuts if no modal is open and not in input field
        if (document.querySelector('.modal[style*="block"]') ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'n':
                    e.preventDefault();
                    showCourseSelectionModal();
                    break;
                case 'h':
                    e.preventDefault();
                    showSessionHistoryModal();
                    break;
                case 's':
                    e.preventDefault();
                    showStatisticsModal();
                    break;
                case 'm':
                    e.preventDefault();
                    showAddManuallyModal();
                    break;
                case 'u':
                    e.preventDefault();
                    showStudentListModal();
                    break;
                case 'e':
                    e.preventDefault();
                    exportAttendanceCSV();
                    break;
            }
        }

        // ESC key to close modals
        if (e.key === 'Escape') {
            const modal = document.querySelector('.modal[style*="block"]');
            if (modal) {
                modal.remove();
            }
        }
    });
}

function setupModalEventListeners() {
    // Global modal click handlers
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.remove();
        }
    });
}

function setupRealtimeSubscriptions() {
    if (!supabaseClient) return;

    try {
        console.log('🔔 Setting up realtime subscriptions...');

        // Subscribe to attendance changes
        attendanceSubscription = supabaseClient
            .channel('attendance_changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'attendance' },
                (payload) => {
                    console.log('📊 Attendance change detected:', payload);
                    if (currentSession) {
                        fetchCurrentSessionAttendance();
                    }
                }
            )
            .subscribe();

        // Subscribe to student changes
        studentSubscription = supabaseClient
            .channel('student_changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'students' },
                (payload) => {
                    console.log('👥 Student change detected:', payload);
                    fetchAllStudents();
                }
            )
            .subscribe();

        // Clean up subscriptions on page unload
        window.addEventListener('beforeunload', () => {
            if (attendanceSubscription) {
                supabaseClient.removeChannel(attendanceSubscription);
            }
            if (studentSubscription) {
                supabaseClient.removeChannel(studentSubscription);
            }
        });

    } catch (error) {
        console.error('❌ Error setting up realtime subscriptions:', error);
    }
}

function startPeriodicRefresh() {
    // Refresh attendance data every 30 seconds if there's an active session
    setInterval(() => {
        if (currentSession && isOnline) {
            fetchCurrentSessionAttendance();
        }
    }, 30000);
}

async function removeStudentFromSession(studentName, usn) {
    if (!currentSession || !confirm(`Remove ${studentName} from the session?`)) return;

    try {
        const { error } = await supabaseClient
            .from('attendance')
            .delete()
            .match({ student: studentName, usn: usn, session_id: currentSession.id });

        if (error) throw error;

        showToast(`${studentName} removed from session`, 'success');
        fetchCurrentSessionAttendance();
    } catch (err) {
        console.error('❌ Error removing student:', err);
        showToast('Failed to remove student', 'error');
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Link copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            fallbackCopyTextToClipboard(text);
        });
    } else {
        fallbackCopyTextToClipboard(text);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showToast('Link copied to clipboard!', 'success');
        } else {
            throw new Error('Copy command failed');
        }
    } catch (err) {
        console.error('Fallback copy failed: ', err);
        showToast('Failed to copy link. Please copy manually.', 'error');
    }

    document.body.removeChild(textArea);
}

function openInNewTab(url) {
    const newWindow = window.open(url, '_blank');
    if (!newWindow) {
        showToast('Popup blocked. Please allow popups for this site.', 'error');
    } else {
        showToast('Student page opened in new tab', 'info');
    }
}

function showToast(message, type = 'info', duration = 5000) {
    console.log(`🔔 Toast [${type}]:`, message);

    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn('Toast container not found, falling back to alert');
        alert(message);
        return;
    }

    const toast = document.createElement('div');
    toast.className = `${type}-toast`;

    const icon = type === 'success' ? 'fa-check-circle' :
                type === 'error' ? 'fa-exclamation-triangle' :
                type === 'info' ? 'fa-info-circle' :
                'fa-bell';

    const toastId = 'toast-' + Date.now();
    toast.id = toastId;

    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${escapeHtml(message)}</span>
        <button onclick="removeToast('${toastId}')" aria-label="Close notification">×</button>
    `;

    container.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.add('toast-show');
    }, 10);

    // Auto remove
    setTimeout(() => {
        removeToast(toastId);
    }, duration);

    // Limit number of toasts
    const allToasts = container.querySelectorAll('.success-toast, .error-toast, .info-toast');
    if (allToasts.length > 5) {
        allToasts[0].remove();
    }
}

function removeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (toast) {
        toast.classList.add('toast-hide');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 300);
    }
}

function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

function getTimeAgo(date) {
    const now = new Date();
    const diffInMs = now - date;
    const diffInMinutes = Math.floor(diffInMs / 60000);

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;

    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) return `${diffInWeeks}w ago`;

    return date.toLocaleDateString();
}

function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 300000 // 5 minutes
        };

        navigator.geolocation.getCurrentPosition(
            resolve,
            (error) => {
                console.warn('Geolocation error:', error);
                reject(error);
            },
            options
        );
    });
}

function displayFatalError(error) {
    const container = document.querySelector('.container') || document.body;
    container.innerHTML = `
        <div style="
            background: white;
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
            margin: 50px auto;
            max-width: 600px;
        ">
            <i class="fas fa-exclamation-triangle" style="
                font-size: 4rem;
                color: #dc3545;
                margin-bottom: 20px;
            "></i>
            <h2 style="color: #dc3545; margin-bottom: 15px;">Application Error</h2>
            <p style="color: #666; margin-bottom: 20px;">
                Failed to initialize the QR Attendance System.
            </p>
            <p style="color: #999; font-size: 0.9rem; margin-bottom: 30px;">
                Error: ${error.message}
            </p>
            <button onclick="window.location.reload()" style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 12px 25px;
                border-radius: 10px;
                cursor: pointer;
                font-size: 1rem;
                font-weight: 600;
            ">
                <i class="fas fa-redo"></i> Retry
            </button>
        </div>
    `;
}

// ===== STUDENT VIEW FUNCTIONS =====

function updateSessionDisplay(sessionData) {
    const sessionNameEl = document.getElementById('session-name-display');
    const courseNameEl = document.getElementById('course-name-display');
    const sessionTimeEl = document.getElementById('session-time-display');

    if (sessionNameEl) {
        sessionNameEl.textContent = sessionData.session_name;
    }

    if (courseNameEl) {
        const courseName = sessionData.courses ? sessionData.courses.course_name : 'General Course';
        const courseId = sessionData.courses ? sessionData.courses.course_id : '';
        courseNameEl.textContent = `${courseName} ${courseId}`.trim();
    }

    if (sessionTimeEl) {
        const createdTime = new Date(sessionData.created_at).toLocaleString();
        sessionTimeEl.innerHTML = `<i class="fas fa-clock"></i> ${createdTime}`;
    }
}

function populateStudentListForAttendance() {
    const listElement = document.getElementById('student-list');
    if (!listElement) return;

    if (allStudents.length === 0) {
        listElement.innerHTML = `
            <div class="loading-students">
                <i class="fas fa-exclamation-triangle"></i>
                <span>No students found</span>
            </div>
        `;
        return;
    }

    listElement.innerHTML = '';

    allStudents.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-list-item';
        studentDiv.setAttribute('role', 'option');
        studentDiv.setAttribute('tabindex', '0');

        studentDiv.innerHTML = `
            <div class="student-details">
                <div class="student-name">${escapeHtml(student.name)}</div>
                <div class="student-usn">${escapeHtml(student.usn)}</div>
            </div>
            <div class="selection-indicator">
                <i class="fas fa-check"></i>
            </div>
        `;

        studentDiv.addEventListener('click', () => selectStudentForAttendance(student, studentDiv));
        listElement.appendChild(studentDiv);
    });
}

function selectStudentForAttendance(student, element) {
    // Remove previous selection
    document.querySelectorAll('.student-list-item.selected').forEach(item => {
        item.classList.remove('selected');
    });

    // Add selection to clicked item
    element.classList.add('selected');
    selectedStudentForAttendance = student;

    // Enable submit button
    const submitBtn = document.getElementById('submit-attendance');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.onclick = submitStudentAttendance;
    }
}

async function submitStudentAttendance() {
    if (!selectedStudentForAttendance || !currentSession) {
        showToast('Please select a student first', 'error');
        return;
    }

    const submitBtn = document.getElementById('submit-attendance');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="loading"></div> Submitting...';
    }

    try {
        // Check if student already marked attendance
        const { data: existingAttendance, error: checkError } = await supabaseClient
            .from('attendance')
            .select('*')
            .eq('session_id', currentSession.id)
            .eq('usn', selectedStudentForAttendance.usn)
            .single();

        if (existingAttendance) {
            showToast('Attendance already marked for this session', 'error');
            return;
        }

        // Get location if possible
        let locationData = null;
        try {
            const position = await getCurrentPosition();
            locationData = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
        } catch (err) {
            console.log('Location not available:', err);
        }

        // Insert attendance record
        const attendanceRecord = {
            session_id: currentSession.id,
            student: selectedStudentForAttendance.name,
            usn: selectedStudentForAttendance.usn,
            timestamp: new Date().toISOString(),
            fingerprint_verified: false,
            location_verified: locationData !== null,
            location_data: locationData
        };

        const { error: insertError } = await supabaseClient
            .from('attendance')
            .insert([attendanceRecord]);

        if (insertError) throw insertError;

        showSuccessPage(selectedStudentForAttendance, new Date());

    } catch (err) {
        console.error('❌ Error submitting attendance:', err);
        showToast('Failed to submit attendance. Please try again.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Attendance';
        }
    }
}

function setupStudentSearch() {
    const searchInput = document.getElementById('student-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        filterStudentListForAttendance(searchTerm);
    });
}

function filterStudentListForAttendance(searchTerm) {
    const studentItems = document.querySelectorAll('.student-list-item');

    studentItems.forEach(item => {
        const name = item.querySelector('.student-name')?.textContent.toLowerCase() || '';
        const usn = item.querySelector('.student-usn')?.textContent.toLowerCase() || '';

        if (name.includes(searchTerm) || usn.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function showSuccessPage(student, timestamp) {
    const selectionPage = document.getElementById('student-selection-page');
    const successPage = document.getElementById('success-page');

    if (selectionPage) selectionPage.classList.add('hidden');
    if (successPage) successPage.classList.remove('hidden');

    const nameEl = document.getElementById('success-student-name');
    const timestampEl = document.getElementById('success-timestamp');

    if (nameEl) nameEl.textContent = student.name;
    if (timestampEl) timestampEl.textContent = timestamp.toLocaleString();

    // Auto-close after 10 seconds
    setTimeout(() => {
        window.close();
    }, 10000);
}

function showErrorPage(message) {
    const selectionPage = document.getElementById('student-selection-page');
    const errorPage = document.getElementById('error-page');
    const messageEl = document.getElementById('error-message-text');

    if (selectionPage) selectionPage.classList.add('hidden');
    if (errorPage) errorPage.classList.remove('hidden');
    if (messageEl) messageEl.textContent = message;
}

// ===== AUTHENTICATION FUNCTIONS =====

async function logout() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;

        localStorage.clear();
        sessionStorage.clear();

        // Clear subscriptions
        if (attendanceSubscription) {
            supabaseClient.removeChannel(attendanceSubscription);
        }
        if (studentSubscription) {
            supabaseClient.removeChannel(studentSubscription);
        }

        showToast('Logged out successfully', 'success');

        // Redirect to login page after a short delay
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);

    } catch (err) {
        console.error('❌ Error logging out:', err);
        showToast('Failed to logout', 'error');
    }
}

// ===== CHART FUNCTIONS =====

function generateAttendanceTrendChart(attendanceData) {
    const ctx = document.getElementById('attendance-trend-chart');
    if (!ctx || !window.Chart) return;

    // Destroy existing chart
    if (attendanceChart) {
        attendanceChart.destroy();
    }

    // Prepare data for last 30 days
    const last30Days = [];
    const attendanceCounts = {};

    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        last30Days.push(dateStr);
        attendanceCounts[dateStr] = 0;
    }

    // Count attendance by date
    attendanceData.forEach(record => {
        const recordDate = new Date(record.timestamp).toISOString().split('T')[0];
        if (attendanceCounts.hasOwnProperty(recordDate)) {
            attendanceCounts[recordDate]++;
        }
    });

    const chartData = last30Days.map(date => attendanceCounts[date]);
    const labels = last30Days.map(date => new Date(date).toLocaleDateString());

    attendanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Daily Attendance',
                data: chartData,
                borderColor: 'rgb(30, 90, 168)',
                backgroundColor: 'rgba(30, 90, 168, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function generateVerificationMethodChart(attendanceData) {
    const ctx = document.getElementById('verification-method-chart');
    if (!ctx || !window.Chart) return;

    // Destroy existing chart
    if (verificationChart) {
        verificationChart.destroy();
    }

    // Count verification methods
    let fingerprintOnly = 0;
    let locationOnly = 0;
    let both = 0;
    let neither = 0;

    attendanceData.forEach(record => {
        if (record.fingerprint_verified && record.location_verified) {
            both++;
        } else if (record.fingerprint_verified) {
            fingerprintOnly++;
        } else if (record.location_verified) {
            locationOnly++;
        } else {
            neither++;
        }
    });

    verificationChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Both', 'Fingerprint Only', 'Location Only', 'Manual'],
            datasets: [{
                data: [both, fingerprintOnly, locationOnly, neither],
                backgroundColor: [
                    '#28a745',
                    '#ffc107',
                    '#17a2b8',
                    '#6c757d'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

async function fetchStudentStatistics(searchTerm = '') {
    const listElement = document.getElementById('student-stats-list');
    if (!listElement) return;

    try {
        // Fetch attendance data with student details
        const { data: attendanceData, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, session_id, fingerprint_verified, location_verified');

        if (error) throw error;

        // Group by student
        const studentStats = {};

        attendanceData.forEach(record => {
            if (!studentStats[record.usn]) {
                studentStats[record.usn] = {
                    name: record.student,
                    usn: record.usn,
                    totalAttendance: 0,
                    fingerprintVerified: 0,
                    locationVerified: 0,
                    sessions: new Set()
                };
            }

            const stats = studentStats[record.usn];
            stats.totalAttendance++;
            stats.sessions.add(record.session_id);

            if (record.fingerprint_verified) stats.fingerprintVerified++;
            if (record.location_verified) stats.locationVerified++;
        });

        // Convert to array and filter
        let statsArray = Object.values(studentStats);

        if (searchTerm) {
            statsArray = statsArray.filter(student =>
                student.name.toLowerCase().includes(searchTerm) ||
                student.usn.toLowerCase().includes(searchTerm)
            );
        }

        // Sort by total attendance (descending)
        statsArray.sort((a, b) => b.totalAttendance - a.totalAttendance);

        if (statsArray.length === 0) {
            listElement.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-chart-bar" style="font-size: 2rem; color: #dee2e6; margin-bottom: 10px;"></i>
                    <p>No student statistics found</p>
                </div>
            `;
            return;
        }

        listElement.innerHTML = '';

        statsArray.forEach(student => {
            const studentDiv = document.createElement('div');
            studentDiv.className = 'student-stats-item';

            studentDiv.innerHTML = `
                <div class="student-info">
                    <div class="student-name">${escapeHtml(student.name)}</div>
                    <div class="student-usn">${escapeHtml(student.usn)}</div>
                </div>
                <div class="student-stats">
                    <div class="stat-item">
                        <span class="stat-label">Total Attendance:</span>
                        <span class="stat-value">${student.totalAttendance}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Sessions:</span>
                        <span class="stat-value">${student.sessions.size}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Fingerprint:</span>
                        <span class="stat-value">${student.fingerprintVerified}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Location:</span>
                        <span class="stat-value">${student.locationVerified}</span>
                    </div>
                </div>
            `;

            listElement.appendChild(studentDiv);
        });

    } catch (err) {
        console.error('❌ Error loading student statistics:', err);
        showToast('Failed to load student statistics', 'error');
    }
}

// ===== ERROR HANDLING =====

// Global error handler
window.addEventListener('error', (event) => {
    console.error('💥 Global error:', event.error);
    showToast('An unexpected error occurred. Please refresh the page.', 'error');
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('💥 Unhandled promise rejection:', event.reason);
    showToast('A network error occurred. Please check your connection.', 'error');
    event.preventDefault(); // Prevent the default browser behavior
});

// ===== INITIALIZATION COMPLETE =====

console.log('✅ QR Attendance System script loaded successfully');

// Export functions for global access (if needed)
window.QRAttendanceSystem = {
    showCourseSelectionModal,
    showSessionHistoryModal,
    showStatisticsModal,
    showAddManuallyModal,
    showStudentListModal,
    showCoursesModal,
    exportAttendanceCSV,
    logout
};
