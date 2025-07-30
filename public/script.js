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
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Network and retry logic
let retryCount = 0;
const MAX_RETRIES = 3;
let isOnline = navigator.onLine;

// ✅ MAIN ENTRY POINT
document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * Initializes the Supabase client, checks auth, fetches data, and starts the correct UI.
 */
async function initializeApp() {
    // Show loading screen
    showLoadingScreen(true);
    
    try {
        const SUPABASE_URL = 'https://zpesqzstorixfsmpntsx.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ';
        
        // Validate environment
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            throw new Error('Missing Supabase configuration');
        }
        
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        
        // Test connection
        await testDatabaseConnection();
        
    } catch (error) {
        console.error('Database connection error:', error);
        showToast('FATAL: Could not connect to the database. Please check your connection.', 'error');
        showLoadingScreen(false);
        return;
    }

    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) {
        console.error('Session error:', sessionError);
        showToast('Authentication error. Please try again.', 'error');
    }
    
    const isStudentPage = window.location.pathname.includes('student.html');
    const isLoginPage = window.location.pathname.includes('login.html');

    // Handle authentication routing
    if (!session && !isStudentPage && !isLoginPage) {
        showLoadingScreen(false);
        return window.location.href = 'login.html';
    }

    // Initialize data with error handling
    try {
        await Promise.all([
            fetchAllStudents(),
            fetchAllCourses()
        ]);
    } catch (error) {
        console.error('Data initialization error:', error);
        showToast('Failed to load initial data. Some features may not work properly.', 'error');
    }

    // Initialize appropriate view
    if (isStudentPage) {
        await initStudentView();
    } else if (!isLoginPage) {
        await initFacultyView();
    }

    setupKeyboardShortcuts();
    setupNetworkMonitoring();
    setupServiceWorker();
    
    showLoadingScreen(false);
}

// =================================================================
// UTILITY AND HELPER FUNCTIONS
// =================================================================

function showLoadingScreen(show) {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        if (show) {
            loadingScreen.style.display = 'flex';
            loadingScreen.style.opacity = '1';
        } else {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 300);
        }
    }
}

async function testDatabaseConnection() {
    try {
        const { data, error } = await supabaseClient
            .from('students')
            .select('count')
            .limit(1);
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Database connection test failed:', error);
        throw new Error('Database connection failed');
    }
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

async function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            // Register service worker for offline functionality
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered successfully:', registration);
        } catch (error) {
            console.log('Service Worker registration failed:', error);
        }
    }
}

async function retryFailedOperations() {
    // Implement retry logic for failed operations
    if (currentSession) {
        fetchCurrentSessionAttendance();
    }
    fetchAllStudents();
    fetchAllCourses();
}

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
                console.log(`Retry attempt ${i + 1}/${maxRetries} after ${delay}ms`);
            }
        }
    }
    
    throw lastError;
}

// =================================================================
// DATA FETCHING & STATE MANAGEMENT (ENHANCED)
// =================================================================

async function fetchAllStudents() {
    try {
        // Check cache first
        const now = Date.now();
        if (studentsCache.has('students') && (now - lastFetchTime) < CACHE_DURATION) {
            allStudents = studentsCache.get('students');
            return;
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
        
    } catch (err) {
        console.error('Error fetching students:', err);
        
        // Fall back to cached data if available
        if (studentsCache.has('students')) {
            allStudents = studentsCache.get('students');
            showToast('Using cached student data', 'info');
        } else {
            allStudents = [];
            showToast('Failed to load students', 'error');
        }
    }
}

async function fetchAllCourses() {
    try {
        const operation = async () => {
            const { data, error } = await supabaseClient
                .from('courses')
                .select('*')
                .order('course_name', { ascending: true });
            
            if (error) throw error;
            return data || [];
        };

        allCourses = await executeWithRetry(operation);
        
    } catch (err) {
        console.error('Error fetching courses:', err);
        allCourses = [];
        showToast('Failed to load courses', 'error');
    }
}

async function fetchCurrentSessionAttendance() {
    if (!currentSession) {
        updatePresentStudentsList([]);
        return;
    }

    try {
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
        
    } catch (err) {
        console.error('Error fetching attendance:', err);
        if (isOnline) {
            showToast('Failed to refresh attendance data', 'error');
        }
    }
}

async function fetchAllSessions(includeArchived = false) {
    try {
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
                session.attendance_count = 0;
            }
        }));
        
        populateSessionHistoryList();
        
    } catch (err) {
        console.error('Error fetching sessions:', err);
        allSessions = [];
        showToast('Failed to load session history', 'error');
    }
}

function updateActiveSession(sessionData) {
    currentSession = sessionData;
    const qrContainer = document.getElementById('qr-code-container');
    const sessionTitle = document.getElementById('current-session-title');

    if (sessionData) {
        localStorage.setItem('sessionId', sessionData.id);
        const courseName = sessionData.courses ? sessionData.courses.course_name : 'General';
        if (sessionTitle) {
            sessionTitle.innerHTML = `
                <i class="fas fa-play-circle" style="color: #28a745;"></i>
                Active Session: ${sessionData.session_name} (${courseName})
            `;
        }
        generateQR(sessionData.id);
        fetchCurrentSessionAttendance();
    } else {
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

// =================================================================
// FACULTY VIEW FUNCTIONS
// =================================================================

// =================================================================
// ENHANCED FACULTY VIEW FUNCTIONS
// =================================================================

async function initFacultyView() {
    try {
        const lastSessionId = localStorage.getItem('sessionId');
        if (lastSessionId) {
            const { data, error } = await supabaseClient
                .from('sessions')
                .select('*, courses(course_name)')
                .eq('id', lastSessionId)
                .single();
                
            if (data && !error) {
                updateActiveSession(data);
            } else {
                updateActiveSession(null);
                localStorage.removeItem('sessionId');
            }
        } else {
            updateActiveSession(null);
        }
        
        // Set up real-time attendance refresh
        const refreshInterval = setInterval(() => {
            if (currentSession && isOnline) {
                fetchCurrentSessionAttendance();
            }
        }, 5000);
        
        // Clean up interval on page unload
        window.addEventListener('beforeunload', () => {
            clearInterval(refreshInterval);
        });
        
        setupAllModalSearchListeners();
        setupRealtimeSubscriptions();
        
    } catch (error) {
        console.error('Error initializing faculty view:', error);
        showToast('Failed to initialize dashboard', 'error');
    }
}

function setupRealtimeSubscriptions() {
    if (!supabaseClient) return;
    
    try {
        // Subscribe to attendance changes
        const attendanceSubscription = supabaseClient
            .channel('attendance_changes')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'attendance' },
                (payload) => {
                    console.log('Attendance change detected:', payload);
                    if (currentSession) {
                        fetchCurrentSessionAttendance();
                    }
                }
            )
            .subscribe();

        // Subscribe to student changes
        const studentSubscription = supabaseClient
            .channel('student_changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'students' },
                (payload) => {
                    console.log('Student change detected:', payload);
                    fetchAllStudents();
                }
            )
            .subscribe();

        // Clean up subscriptions on page unload
        window.addEventListener('beforeunload', () => {
            supabaseClient.removeChannel(attendanceSubscription);
            supabaseClient.removeChannel(studentSubscription);
        });
        
    } catch (error) {
        console.error('Error setting up realtime subscriptions:', error);
    }
}

function generateQR(sessionId) {
    const qrContainer = document.getElementById('qr-code-container');
    if (!qrContainer) return;
    
    qrContainer.innerHTML = '<div class="qr-loading">Generating QR code...</div>';
    
    try {
        const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;
        
        // Validate URL before generating QR
        if (!studentUrl || !sessionId) {
            throw new Error('Invalid session data for QR generation');
        }
        
        const canvas = document.createElement('canvas');
        qrContainer.innerHTML = '';
        qrContainer.appendChild(canvas);
        
        const qr = new QRious({ 
            element: canvas, 
            value: studentUrl, 
            size: 250,
            background: 'white',
            foreground: 'black',
            level: 'M', // Error correction level
            padding: 10
        });

        // Add session info and URL display
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
        
        // Auto-refresh QR code every 30 minutes for security
        setTimeout(() => {
            if (currentSession && currentSession.id === sessionId) {
                generateQR(sessionId);
                showToast('QR code refreshed for security', 'info');
            }
        }, 30 * 60 * 1000);
        
    } catch (error) {
        console.error('QR generation error:', error);
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

function updatePresentStudentsList(attendanceData) {
    const listElement = document.getElementById('present-students-list');
    updatePresentCount(attendanceData.length);

    if (!listElement) return;
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
        if (record.fingerprint_verified) badges.push('<span class="badge fingerprint-badge">🔐 Fingerprint</span>');
        if (record.location_verified) badges.push('<span class="badge location-badge">📍 Location</span>');
        
        const timeAgo = getTimeAgo(new Date(record.timestamp));
        
        studentDiv.innerHTML = `
            <div class="student-info">
                <div class="student-name">${record.student}</div>
                <div class="student-usn">${record.usn}</div>
                <div class="attendance-time">${timeAgo}</div>
                <div class="student-badges">${badges.join('')}</div>
            </div>
            <button class="remove-btn" onclick="removeStudentFromSession('${record.student.replace(/'/g, "\\'")}', '${record.usn}')" title="Remove student">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        listElement.appendChild(studentDiv);
    });
}

function updatePresentCount(count) {
    const countElement = document.getElementById('present-count');
    if (countElement) countElement.textContent = count;
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
        console.error('Error removing student:', err);
        showToast('Failed to remove student', 'error');
    }
}

// =================================================================
// STUDENT VIEW FUNCTIONS
// =================================================================

function initStudentView() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    
    if (!sessionId) {
        showErrorPage('No session ID provided. Please scan a valid QR code.');
        return;
    }
    
    loadSessionForStudent(sessionId);
    setupStudentSearch();
}

async function loadSessionForStudent(sessionId) {
    try {
        const { data: sessionData, error: sessionError } = await supabaseClient
            .from('sessions')
            .select(`
                *,
                courses(course_name, course_id)
            `)
            .eq('id', sessionId)
            .single();
        
        if (sessionError) throw sessionError;
        
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
                <div class="student-name">${student.name}</div>
                <div class="student-usn">${student.usn}</div>
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
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
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
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Attendance';
            }
            return;
        }
        
        // Get location if possible
        let locationData = null;
        if (navigator.geolocation) {
            try {
                const position = await getCurrentPosition();
                locationData = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
            } catch (err) {
                console.log('Location not available:', err);
            }
        }
        
        // Insert attendance record
        const attendanceRecord = {
            session_id: currentSession.id,
            student: selectedStudentForAttendance.name,
            usn: selectedStudentForAttendance.usn,
            timestamp: new Date().toISOString(),
            fingerprint_verified: false, // Would be true if fingerprint was used
            location_verified: locationData !== null,
            location_data: locationData
        };
        
        const { error: insertError } = await supabaseClient
            .from('attendance')
            .insert([attendanceRecord]);
        
        if (insertError) throw insertError;
        
        showSuccessPage(selectedStudentForAttendance, new Date());
        
    } catch (err) {
        console.error('Error submitting attendance:', err);
        showToast('Failed to submit attendance. Please try again.', 'error');
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
        filterStudentList(searchTerm);
    });
}

function filterStudentList(searchTerm) {
    const studentItems = document.querySelectorAll('.student-list-item');
    
    studentItems.forEach(item => {
        const name = item.querySelector('.student-name').textContent.toLowerCase();
        const usn = item.querySelector('.student-usn').textContent.toLowerCase();
        
        if (name.includes(searchTerm) || usn.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function showSuccessPage(student, timestamp) {
    document.getElementById('student-selection-page').classList.add('hidden');
    document.getElementById('success-page').classList.remove('hidden');
    
    document.getElementById('success-student-name').textContent = student.name;
    document.getElementById('success-timestamp').textContent = timestamp.toLocaleString();
    
    // Auto-close after 10 seconds
    setTimeout(() => {
        window.close();
    }, 10000);
}

function showErrorPage(message) {
    document.getElementById('student-selection-page').classList.add('hidden');
    document.getElementById('error-page').classList.remove('hidden');
    document.getElementById('error-message-text').textContent = message;
}

// =================================================================
// MODAL FUNCTIONS
// =================================================================

function setupAllModalSearchListeners() {
    const studentListSearch = document.getElementById('student-list-search');
    if (studentListSearch) {
        studentListSearch.addEventListener('input', (e) => {
            populateStudentListDisplayWithFingerprint(e.target.value.toLowerCase().trim());
        });
    }
    
    const studentSearchManual = document.getElementById('student-search-manual');
    if (studentSearchManual) {
        studentSearchManual.addEventListener('input', (e) => {
            populateFacultyStudentDropdown(e.target.value.toLowerCase().trim());
        });
    }
    
    const studentStatsSearch = document.getElementById('student-stats-search');
    if (studentStatsSearch) {
        studentStatsSearch.addEventListener('input', (e) => {
            fetchStudentStatistics(e.target.value.toLowerCase().trim());
        });
    }
    
    const sessionHistorySearch = document.getElementById('session-history-search');
    if (sessionHistorySearch) {
        sessionHistorySearch.addEventListener('input', (e) => {
            filterSessionHistory(e.target.value.toLowerCase().trim());
        });
    }
}

// Course Selection Modal
function showCourseSelectionModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-rocket"></i> Start New Session</h3>
                <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="session-name-input">
                        <i class="fas fa-tag"></i> Session Name
                    </label>
                    <input type="text" id="session-name-input" placeholder="Enter session name" required>
                </div>
                <div class="form-group">
                    <label for="course-select">
                        <i class="fas fa-book"></i> Select Course
                    </label>
                    <select id="course-select" required>
                        <option value="">Choose a course...</option>
                        ${allCourses.map(course => 
                            `<option value="${course.id}">${course.course_name} (${course.course_id})</option>`
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
        document.getElementById('session-name-input')?.focus();
    }, 100);
}

async function createNewSession() {
    const sessionName = document.getElementById('session-name-input')?.value.trim();
    const courseId = document.getElementById('course-select')?.value;
    
    if (!sessionName) {
        showToast('Please enter a session name', 'error');
        return;
    }
    
    if (!courseId) {
        showToast('Please select a course', 'error');
        return;
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('sessions')
            .insert([{
                session_name: sessionName,
                course_id: courseId,
                created_at: new Date().toISOString()
            }])
            .select('*, courses(course_name)')
            .single();
        
        if (error) throw error;
        
        updateActiveSession(data);
        showToast('Session started successfully!', 'success');
        document.querySelector('.modal').remove();
        
    } catch (err) {
        console.error('Error creating session:', err);
        showToast('Failed to create session', 'error');
    }
}

// Student List Modal
function showStudentListModal() { 
    document.getElementById('student-list-modal').style.display = 'block';
    populateStudentListDisplayWithFingerprint();
}

function closeStudentListModal() { 
    document.getElementById('student-list-modal').style.display = 'none';
}

async function populateStudentListDisplayWithFingerprint(searchTerm = '') {
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
                <div class="student-name">${student.name}</div>
                <div class="student-usn">${student.usn}</div>
            </div>
            <div class="student-actions">
                <button class="edit-btn" onclick="showEditStudentModal('${student.usn}')" title="Edit student">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="remove-btn" onclick="deleteStudent('${student.usn}', '${student.name.replace(/'/g, "\\'")}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        listElement.appendChild(studentDiv);
    });
}

async function addNewStudent() {
    const nameInput = document.getElementById('new-student-name');
    const usnInput = document.getElementById('new-student-usn');
    
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
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('students')
            .insert([{ name, usn }]);
        
        if (error) throw error;
        
        await fetchAllStudents();
        populateStudentListDisplayWithFingerprint();
        showToast('Student added successfully!', 'success');
        
        // Clear inputs
        if (nameInput) nameInput.value = '';
        if (usnInput) usnInput.value = '';
        
    } catch (err) {
        console.error('Error adding student:', err);
        showToast('Failed to add student', 'error');
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
        populateStudentListDisplayWithFingerprint();
        showToast('Student deleted successfully', 'success');
        
    } catch (err) {
        console.error('Error deleting student:', err);
        showToast('Failed to delete student', 'error');
    }
}

// Edit Student Modal
function showEditStudentModal(usn) {
    const student = allStudents.find(s => s.usn === usn);
    if (!student) return;
    
    document.getElementById('edit-student-title').textContent = `Edit ${student.name}`;
    document.getElementById('edit-student-original-usn').value = student.usn;
    document.getElementById('edit-student-name').value = student.name;
    document.getElementById('edit-student-usn').value = student.usn;
    loadStudentFingerprints(student.usn);
    document.getElementById('edit-student-modal').style.display = 'block';
}

function closeEditStudentModal() {
    document.getElementById('edit-student-modal').style.display = 'none';
}

async function saveStudentDetails() {
    const originalUsn = document.getElementById('edit-student-original-usn')?.value;
    const newName = document.getElementById('edit-student-name')?.value.trim();
    const newUsn = document.getElementById('edit-student-usn')?.value.trim();
    
    if (!newName || !newUsn) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('students')
            .update({ name: newName, usn: newUsn })
            .eq('usn', originalUsn);
        
        if (error) throw error;
        
        await fetchAllStudents();
        populateStudentListDisplayWithFingerprint();
        closeEditStudentModal();
        showToast('Student updated successfully!', 'success');
        
    } catch (err) {
        console.error('Error updating student:', err);
        showToast('Failed to update student', 'error');
    }
}

async function loadStudentFingerprints(usn) {
    const fingerprintList = document.getElementById('student-fingerprint-list');
    if (!fingerprintList) return;
    
    fingerprintList.innerHTML = `
        <div class="fingerprint-placeholder">
            <i class="fas fa-fingerprint" style="font-size: 3rem; color: #dee2e6; margin-bottom: 15px;"></i>
            <p>Fingerprint management would be implemented here</p>
            <p style="font-size: 0.9rem; color: #666;">This feature requires specialized hardware integration</p>
        </div>
    `;
}

// Manual Add Modal
function showAddManuallyModal() { 
    if (!currentSession) {
        showToast('Please start a session first', 'error');
        return;
    }
    document.getElementById('add-manually-modal').style.display = 'block';
    populateFacultyStudentDropdown();
}

function closeAddManuallyModal() { 
    document.getElementById('add-manually-modal').style.display = 'none';
    document.getElementById('student-search-manual').value = '';
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
            </div>
        `;
        return;
    }
    
    availableStudents.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'dropdown-student-item';
        studentDiv.innerHTML = `
            <div class="student-info">
                <div class="student-name">${student.name}</div>
                <div class="student-usn">${student.usn}</div>
            </div>
            <button class="add-student-manual-btn" onclick="addStudentManually('${student.name.replace(/'/g, "\\'")}', '${student.usn}')">
                <i class="fas fa-plus"></i> Add
            </button>
        `;
        dropdownElement.appendChild(studentDiv);
    });
}

async function addStudentManually(studentName, usn) {
    if (!currentSession) {
        showToast('No active session', 'error');
        return;
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
        console.error('Error adding student manually:', err);
        showToast('Failed to add student', 'error');
    }
}

// Session History Modal
function showSessionHistoryModal() {
    document.getElementById('session-history-modal').style.display = 'block';
    fetchAllSessions();
}

function closeSessionHistoryModal() { 
    document.getElementById('session-history-modal').style.display = 'none';
}

function populateSessionHistoryList() {
    const listElement = document.getElementById('session-list-display');
    if (!listElement) return;
    
    if (allSessions.length === 0) {
        listElement.innerHTML = `
            <div class="no-results">
                <i class="fas fa-history" style="font-size: 2rem; color: #dee2e6; margin-bottom: 10px;"></i>
                <p>No sessions found</p>
            </div>
        `;
        return;
    }
    
    listElement.innerHTML = '';
    
    allSessions.forEach(session => {
        const sessionDiv = document.createElement('div');
        sessionDiv.className = 'session-history-item';
        
        const courseName = session.courses ? session.courses.course_name : 'General';
        const courseId = session.courses ? session.courses.course_id : '';
        const createdDate = new Date(session.created_at).toLocaleString();
        const attendanceCount = session.attendance ? session.attendance.length : 0;
        
        sessionDiv.innerHTML = `
            <div class="session-info">
                <div class="session-name">${session.session_name}</div>
                <div class="session-course">${courseName} ${courseId}</div>
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
                <button class="remove-btn" onclick="deleteSession('${session.id}', '${session.session_name.replace(/'/g, "\\'")}')" title="Delete session">
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
        const sessionName = item.querySelector('.session-name').textContent.toLowerCase();
        const courseName = item.querySelector('.session-course').textContent.toLowerCase();
        
        if (sessionName.includes(searchTerm) || courseName.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

async function viewSessionDetails(sessionId) {
    try {
        const { data: attendanceData, error } = await supabaseClient
            .from('attendance')
            .select('*')
            .eq('session_id', sessionId)
            .order('timestamp', { ascending: false });
        
        if (error) throw error;
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3><i class="fas fa-list"></i> Session Attendance Details</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="attendance-list">
                        ${attendanceData.length === 0 ? 
                            '<p>No attendance records found for this session.</p>' :
                            attendanceData.map(record => `
                                <div class="attendance-record">
                                    <div class="student-info">
                                        <div class="student-name">${record.student}</div>
                                        <div class="student-usn">${record.usn}</div>
                                    </div>
                                    <div class="attendance-details">
                                        <div class="attendance-time">${new Date(record.timestamp).toLocaleString()}</div>
                                        <div class="verification-badges">
                                            ${record.fingerprint_verified ? '<span class="badge fingerprint-badge">🔐 Fingerprint</span>' : ''}
                                            ${record.location_verified ? '<span class="badge location-badge">📍 Location</span>' : ''}
                                        </div>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
    } catch (err) {
        console.error('Error loading session details:', err);
        showToast('Failed to load session details', 'error');
    }
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
        
        // If this was the current session, clear it
        if (currentSession && currentSession.id === sessionId) {
            updateActiveSession(null);
        }
        
        showToast('Session deleted successfully', 'success');
        fetchAllSessions();
        
    } catch (err) {
        console.error('Error deleting session:', err);
        showToast('Failed to delete session', 'error');
    }
}

// Courses Modal
function showCoursesModal() { 
    document.getElementById('courses-modal').style.display = 'block';
    populateCoursesList();
}

function closeCoursesModal() { 
    document.getElementById('courses-modal').style.display = 'none';
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
                <div class="course-name">${course.course_name}</div>
                <div class="course-id">${course.course_id}</div>
            </div>
            <div class="course-actions">
                <button class="edit-btn" onclick="editCourse('${course.id}', '${course.course_name.replace(/'/g, "\\'")}', '${course.course_id.replace(/'/g, "\\'")}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="remove-btn" onclick="deleteCourse('${course.id}', '${course.course_name.replace(/'/g, "\\'")}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        listElement.appendChild(courseDiv);
    });
}

async function createNewCourse() {
    const nameInput = document.getElementById('new-course-name');
    const idInput = document.getElementById('new-course-id');
    
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
        return;
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
        
    } catch (err) {
        console.error('Error creating course:', err);
        showToast('Failed to create course', 'error');
    }
}

async function editCourse(id, currentName, currentId) {
    const newName = prompt('Enter new course name:', currentName);
    if (!newName || newName.trim() === '') return;
    
    const newId = prompt('Enter new course ID:', currentId);
    if (!newId || newId.trim() === '') return;
    
    try {
        const { error } = await supabaseClient
            .from('courses')
            .update({ 
                course_name: newName.trim(), 
                course_id: newId.trim() 
            })
            .eq('id', id);
        
        if (error) throw error;
        
        await fetchAllCourses();
        populateCoursesList();
        showToast('Course updated successfully!', 'success');
        
    } catch (err) {
        console.error('Error updating course:', err);
        showToast('Failed to update course', 'error');
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
        console.error('Error deleting course:', err);
        showToast('Failed to delete course', 'error');
    }
}

// Statistics Modal
function showStatisticsModal() {
    document.getElementById('statistics-modal').style.display = 'block';
    showStatsTab('overview');
}

function closeStatisticsModal() {
    document.getElementById('statistics-modal').style.display = 'none';
    if (attendanceChart) {
        attendanceChart.destroy();
        attendanceChart = null;
    }
    if (verificationChart) {
        verificationChart.destroy();
        verificationChart = null;
    }
}

function showStatsTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.stats-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    
    document.querySelectorAll('.stats-view').forEach(view => {
        view.classList.remove('active');
    });
    
    // Activate selected tab
    const activeBtn = document.querySelector(`[onclick="showStatsTab('${tabName}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.setAttribute('aria-selected', 'true');
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
        document.getElementById('stats-total-attendance').textContent = totalAttendance;
        document.getElementById('stats-avg-attendance').textContent = `${avgAttendance}%`;
        document.getElementById('stats-total-sessions').textContent = totalSessions;
        document.getElementById('stats-fully-verified').textContent = `${fullyVerifiedPercent}%`;
        
        // Generate charts
        generateAttendanceTrendChart(attendanceData);
        generateVerificationMethodChart(attendanceData);
        
    } catch (err) {
        console.error('Error loading statistics:', err);
        showToast('Failed to load statistics', 'error');
    }
}

function generateAttendanceTrendChart(attendanceData) {
    const ctx = document.getElementById('attendance-trend-chart');
    if (!ctx) return;
    
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
    if (!ctx) return;
    
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
            
            const attendanceRate = student.sessions.size > 0 ? 
                Math.round((student.totalAttendance / student.sessions.size) * 100) : 0;
            
            studentDiv.innerHTML = `
                <div class="student-info">
                    <div class="student-name">${student.name}</div>
                    <div class="student-usn">${student.usn}</div>
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
        console.error('Error loading student statistics:', err);
        showToast('Failed to load student statistics', 'error');
    }
}

// =================================================================
// EXPORT FUNCTIONS
// =================================================================

async function exportAttendanceCSV() {
    try {
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
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        showToast('Attendance data exported successfully!', 'success');
        
    } catch (err) {
        console.error('Error exporting CSV:', err);
        showToast('Failed to export attendance data', 'error');
    }
}

async function exportSessionCSV(sessionId) {
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
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sessionName}_attendance.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        showToast('Session data exported successfully!', 'success');
        
    } catch (err) {
        console.error('Error exporting session CSV:', err);
        showToast('Failed to export session data', 'error');
    }
}

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

// =================================================================
// ENHANCED UTILITY FUNCTIONS
// =================================================================

function showToast(message, type = 'info', duration = 5000) {
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
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    setTimeout(() => {
        document.body.removeChild(announcement);
    }, 1000);
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

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Enhanced validation functions
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateUSN(usn) {
    // Customize this regex based on your institution's USN format
    const usnRegex = /^[A-Z0-9]{8,15}$/i;
    return usnRegex.test(usn.trim());
}

function validateStudentName(name) {
    const nameRegex = /^[a-zA-Z\s]{2,50}$/;
    return nameRegex.test(name.trim());
}

function sanitizeInput(input) {
    return input.trim().replace(/[<>]/g, '');
}

// Local storage helpers with error handling
function safeLocalStorageGet(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        return value !== null ? JSON.parse(value) : defaultValue;
    } catch (error) {
        console.warn('LocalStorage read error:', error);
        return defaultValue;
    }
}

function safeLocalStorageSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.warn('LocalStorage write error:', error);
        return false;
    }
}

function safeLocalStorageRemove(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.warn('LocalStorage remove error:', error);
        return false;
    }
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
    });
}
// =================================================================
// AUTHENTICATION FUNCTIONS
// =================================================================

async function logout() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        
        localStorage.clear();
        window.location.href = 'login.html';
    } catch (err) {
        console.error('Error logging out:', err);
        showToast('Failed to logout', 'error');
    }
}

// =================================================================
// ERROR HANDLING AND RECOVERY
// =================================================================

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    showToast('An unexpected error occurred. Please refresh the page.', 'error');
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('A network error occurred. Please check your connection.', 'error');
});

// Network status monitoring
window.addEventListener('online', () => {
    showToast('Connection restored', 'success');
});

window.addEventListener('offline', () => {
    showToast('Connection lost. Some features may not work.', 'error');
});

// =================================================================
// PERFORMANCE OPTIMIZATIONS
// =================================================================

// Debounce function for search inputs
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Apply debouncing to search functions
const debouncedPopulateStudentList = debounce(populateStudentListDisplayWithFingerprint, 300);
const debouncedPopulateFacultyDropdown = debounce(populateFacultyStudentDropdown, 300);
const debouncedFetchStudentStats = debounce(fetchStudentStatistics, 300);
const debouncedFilterSessions = debounce(filterSessionHistory, 300);

// Replace direct calls with debounced versions in event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Update search listeners to use debounced functions
    const studentListSearch = document.getElementById('student-list-search');
    if (studentListSearch) {
        studentListSearch.removeEventListener('input', populateStudentListDisplayWithFingerprint);
        studentListSearch.addEventListener('input', (e) => {
            debouncedPopulateStudentList(e.target.value.toLowerCase().trim());
        });
    }
    
    const studentSearchManual = document.getElementById('student-search-manual');
    if (studentSearchManual) {
        studentSearchManual.addEventListener('input', (e) => {
            debouncedPopulateFacultyDropdown(e.target.value.toLowerCase().trim());
        });
    }
    
    const studentStatsSearch = document.getElementById('student-stats-search');
    if (studentStatsSearch) {
        studentStatsSearch.addEventListener('input', (e) => {
            debouncedFetchStudentStats(e.target.value.toLowerCase().trim());
        });
    }
    
    const sessionHistorySearch = document.getElementById('session-history-search');
    if (sessionHistorySearch) {
        sessionHistorySearch.addEventListener('input', (e) => {
            debouncedFilterSessions(e.target.value.toLowerCase().trim());
        });
    }
});

// =================================================================
// FINAL INITIALIZATION
// =================================================================

// Ensure all components are ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize tooltips for buttons
    const buttons = document.querySelectorAll('button[title]');
    buttons.forEach(button => {
        button.addEventListener('mouseenter', (e) => {
            // Could implement custom tooltip here if needed
        });
    });
    
    // Initialize focus management for modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            const modal = document.querySelector('.modal[style*="block"]');
            if (modal) {
                const focusableElements = modal.querySelectorAll(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];
                
                if (e.shiftKey && document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                } else if (!e.shiftKey && document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        }
    });
    
    console.log('QR Attendance System initialized successfully');
});
