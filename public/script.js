// Global Supabase client
let supabaseClient = null;

// Global state variables
let allStudents = [];
let presentStudents = [];
let currentCourseId = null;
let currentSession = null;
let allSessions = [];
let attendanceChart = null;
let verificationChart = null;


// ✅ MAIN ENTRY POINT
document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * Initializes the Supabase client, checks auth, fetches data, and starts the correct UI.
 */
async function initializeApp() {
    try {
        const SUPABASE_URL = 'https://zpesqzstorixfsmpntsx.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ';
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (error) {
        console.error('Database connection error:', error);
        return alert('FATAL: Could not connect to the database.');
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    const isStudentPage = window.location.pathname.includes('student.html');

    if (!session && !isStudentPage) {
        return window.location.href = 'login.html';
    }

    await fetchAllStudents();

    if (isStudentPage) {
        initStudentView();
    } else {
        initFacultyView();
    }
}

// =================================================================
// DATA FETCHING & STATE
// =================================================================

async function fetchAllStudents() {
    try {
        const { data, error } = await supabaseClient
            .from('students')
            .select('name, usn')
            .order('name', { ascending: true });
        
        if (error) throw error;
        allStudents = data || [];
        console.log('✅ Fetched students:', allStudents.length);
    } catch (err) {
        console.error('Error fetching students:', err);
        allStudents = [];
    }
}

async function fetchCurrentSessionAttendance() {
    if (!currentSession) {
        updatePresentStudentsList([]);
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, timestamp, fingerprint_verified, location_verified')
            .eq('session_id', currentSession.id)
            .order('timestamp', { ascending: false });

        if (error) throw error;
        
        const attendanceData = data || [];
        presentStudents = attendanceData.map(record => record.student);
        updatePresentStudentsList(attendanceData);
        console.log('✅ Fetched attendance:', attendanceData.length, 'students');
    } catch (err) {
        console.error('Error fetching attendance:', err);
        updatePresentStudentsList([]);
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
            sessionTitle.textContent = `Active Session: ${sessionData.session_name} (${courseName})`;
        }
        generateQR(sessionData.id);
        fetchCurrentSessionAttendance();
        console.log('✅ Session updated:', sessionData.session_name);
    } else {
        localStorage.removeItem('sessionId');
        if (sessionTitle) {
            sessionTitle.textContent = 'No Active Session';
        }
        if (qrContainer) {
            qrContainer.innerHTML = '<p style="color: #999; font-size: 16px; text-align: center; padding: 40px;">Start a new session to generate a QR code.</p>';
        }
        updatePresentStudentsList([]);
        console.log('✅ Session cleared');
    }
}

// =================================================================
// FACULTY VIEW (`index.html`)
// =================================================================

function initFacultyView() {
    console.log('🚀 Initializing faculty view...');
    
    const lastSessionId = localStorage.getItem('sessionId');
    if (lastSessionId) {
        console.log('🔄 Resuming session:', lastSessionId);
        supabaseClient
            .from('sessions')
            .select('*, courses(course_name)')
            .eq('id', lastSessionId)
            .single()
            .then(({ data, error }) => {
                if (data && !error) {
                    updateActiveSession(data);
                } else {
                    console.log('❌ Previous session not found, clearing state');
                    updateActiveSession(null);
                }
            });
    } else {
        updateActiveSession(null);
    }
    
    setInterval(fetchCurrentSessionAttendance, 5000);
    setupAllModalSearchListeners();
    initializeEnhancedFacultyDashboard();
    console.log('✅ Faculty view initialized');
}

function generateQR(sessionId) {
    const qrContainer = document.getElementById('qr-code-container');
    if (!qrContainer) return;
    qrContainer.innerHTML = '';
    
    try {
        const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;
        new QRious({ element: qrContainer.appendChild(document.createElement('canvas')), value: studentUrl, size: 400, padding: 10, level: 'H' });
    } catch (error) {
        qrContainer.innerHTML = '<p style="color: #dc3545;">Failed to generate QR code.</p>';
    }
}

function updatePresentStudentsList(attendanceData) {
    const listElement = document.getElementById('present-students-list');
    updatePresentCount(attendanceData.length);

    if (!listElement) return;
    listElement.innerHTML = '';

    if (attendanceData.length === 0) {
        listElement.innerHTML = '<div class="student-item" style="opacity: 0.5; font-style: italic;">No students present</div>';
        return;
    }
    
    attendanceData.forEach(record => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-item';
        const fingerprintBadge = record.fingerprint_verified ? '🔐' : '';
        const locationBadge = record.location_verified ? '📍' : '';
        studentDiv.innerHTML = `<span>${record.student} ${fingerprintBadge}${locationBadge}</span><button class="remove-btn" onclick="removeStudentFromSession('${record.student.replace(/'/g, "\\'")}')">Remove</button>`;
        listElement.appendChild(studentDiv);
    });
}


function updatePresentCount(count) {
    const countElement = document.getElementById('present-count');
    if (countElement) countElement.textContent = count;
}

async function removeStudentFromSession(studentName) {
    if (!currentSession || !confirm(`Remove ${studentName}?`)) return;
    await supabaseClient.from('attendance').delete().match({ student: studentName, session_id: currentSession.id });
    fetchCurrentSessionAttendance();
}

// =================================================================
// STUDENT VIEW (`student.html`)
// =================================================================

function initStudentView() {
    console.log('🚀 Initializing student view...');
    populateStudentListForSelection();
    setupStudentEventListeners();
    initializeUserInteractionTracking();
    initializeFingerprintSystem();
    setTimeout(showLocationPermissionRequest, 2000);
}

function populateStudentListForSelection(searchTerm = '') {
    const studentList = document.getElementById('student-list');
    if (!studentList) return;
    
    const studentsToDisplay = allStudents.filter(s => !searchTerm || s.name.toLowerCase().includes(searchTerm) || (s.usn && s.usn.toLowerCase().includes(searchTerm)));
    
    studentList.innerHTML = studentsToDisplay.length === 0 ? '<div class="no-results"><p>No students found</p></div>' : '';
    
    studentsToDisplay.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-checkbox';
        studentDiv.innerHTML = `<input type="radio" name="student" value="${student.name}" data-usn="${student.usn || ''}" id="student-${student.usn}"><label for="student-${student.usn}">${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub></label>`;
        studentList.appendChild(studentDiv);
    });
    
    studentList.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', () => {
            document.getElementById('submit-attendance').disabled = false;
            document.querySelectorAll('.student-checkbox').forEach(box => box.classList.remove('selected'));
            radio.parentElement.classList.add('selected');
        });
    });
}

function setupStudentEventListeners() {
    const submitBtn = document.getElementById('submit-attendance');
    if (submitBtn) {
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        newSubmitBtn.addEventListener('click', submitAttendanceWithFingerprint);
    }
    
    document.getElementById('close-success')?.addEventListener('click', () => window.close());
    document.getElementById('student-search')?.addEventListener('input', (e) => populateStudentListForSelection(e.target.value.toLowerCase().trim()));
}


// =================================================================
// STATISTICS MODAL (ENHANCED)
// =================================================================

function showStatisticsModal() {
    const modal = document.getElementById('statistics-modal');
    if (modal) {
        modal.style.display = 'block';
        showStatsTab('overview');
    }
}

function closeStatisticsModal() {
    document.getElementById('statistics-modal').style.display = 'none';
    if(attendanceChart) attendanceChart.destroy();
    if(verificationChart) verificationChart.destroy();
}

function showStatsTab(tabName) {
    document.querySelectorAll('.stats-view').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.stats-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`stats-${tabName}-view`).classList.add('active');
    document.querySelector(`.stats-tab-btn[onclick="showStatsTab('${tabName}')"]`).classList.add('active');

    if (tabName === 'overview') loadOverviewStatistics();
    if (tabName === 'sessions') fetchSessionStatistics();
    if (tabName === 'students') fetchStudentStatistics();
}

async function loadOverviewStatistics() {
    const { data, error } = await supabaseClient.rpc('get_attendance_overview_stats');
    if(error) return;
    
    document.getElementById('stats-total-attendance').textContent = data.total_attendance;
    document.getElementById('stats-avg-attendance').textContent = data.average_attendance.toFixed(1);
    document.getElementById('stats-total-sessions').textContent = data.total_sessions;
    document.getElementById('stats-fully-verified').textContent = `${data.fully_verified_percentage.toFixed(0)}%`;
    
    loadAttendanceTrendChart();
    loadVerificationMethodChart();
}

async function loadAttendanceTrendChart() {
    const { data, error } = await supabaseClient.rpc('get_attendance_over_time_data');
    if(error) return;

    const ctx = document.getElementById('attendance-trend-chart').getContext('2d');
    if(attendanceChart) attendanceChart.destroy();
    attendanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => new Date(d.date).toLocaleDateString()),
            datasets: [{
                label: 'Total Attendance',
                data: data.map(d => d.count),
                borderColor: '#007bff',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                fill: true,
                tension: 0.3
            }]
        }
    });
}

async function loadVerificationMethodChart() {
    const { data, error } = await supabaseClient.rpc('get_verification_method_data');
    if(error) return;

    const ctx = document.getElementById('verification-method-chart').getContext('2d');
    if(verificationChart) verificationChart.destroy();
    verificationChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Fully Verified', 'Fingerprint Only', 'Location Only', 'Unverified'],
            datasets: [{
                data: [data.fully_verified, data.fingerprint_only, data.location_only, data.unverified],
                backgroundColor: ['#28a745', '#17a2b8', '#ffc107', '#dc3545']
            }]
        }
    });
}


async function fetchSessionStatistics(searchTerm = '') {
    const listDisplay = document.getElementById('session-stats-list');
    listDisplay.innerHTML = '<div class="student-item">Loading statistics...</div>';
    const { data, error } = await supabaseClient.rpc('get_session_statistics');
    
    if (error) {
        listDisplay.innerHTML = '<div class="no-students-message">Could not load session statistics.</div>';
        return;
    }
    
    const filteredData = data.filter(s => !searchTerm || s.session_name.toLowerCase().includes(searchTerm) || s.course_name.toLowerCase().includes(searchTerm));
    renderSessionStatistics(filteredData);
}

function renderSessionStatistics(stats) {
    const listDisplay = document.getElementById('session-stats-list');
    listDisplay.innerHTML = '';
    if (!stats || stats.length === 0) {
        listDisplay.innerHTML = '<div class="no-students-message">No session data found.</div>';
        return;
    }
    stats.forEach(stat => {
        const percentage = stat.total_enrolled > 0 ? (stat.present_count / stat.total_enrolled) * 100 : 0;
        const item = document.createElement('div');
        item.className = 'stat-item';
        item.innerHTML = `
            <div class="stat-item-header">
                <span>${stat.session_name} <small>(${stat.course_name})</small></span>
                <span>${new Date(stat.created_at).toLocaleDateString()}</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${percentage.toFixed(2)}%;"></div>
                <span class="progress-bar-text">${stat.present_count} / ${stat.total_enrolled} (${percentage.toFixed(0)}%)</span>
            </div>`;
        listDisplay.appendChild(item);
    });
}

async function fetchStudentStatistics(searchTerm = '') {
    const listDisplay = document.getElementById('student-stats-list');
    listDisplay.innerHTML = '<div class="student-item">Loading statistics...</div>';
    const { data, error } = await supabaseClient.rpc('get_student_statistics');
    if (error) {
        listDisplay.innerHTML = '<div class="no-students-message">Could not load student statistics.</div>';
        return;
    }
    const filteredData = data.filter(s => !searchTerm || s.student_name.toLowerCase().includes(searchTerm) || (s.student_usn && s.student_usn.toLowerCase().includes(searchTerm)));
    renderStudentStatistics(filteredData);
}

function renderStudentStatistics(stats) {
    const listDisplay = document.getElementById('student-stats-list');
    listDisplay.innerHTML = '';
    if (!stats || stats.length === 0) {
        listDisplay.innerHTML = '<div class="no-students-message">No student data found.</div>';
        return;
    }
    stats.forEach(stat => {
        const percentage = stat.total_sessions > 0 ? (stat.attended_sessions / stat.total_sessions) * 100 : 0;
        const item = document.createElement('div');
        item.className = 'stat-item';
        item.innerHTML = `
            <div class="stat-item-header">
                <span>${stat.student_name} <small>(${stat.student_usn})</small></span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${percentage.toFixed(2)}%;"></div>
                <span class="progress-bar-text">${stat.attended_sessions} / ${stat.total_sessions} Attended (${percentage.toFixed(0)}%)</span>
            </div>`;
        listDisplay.appendChild(item);
    });
}


// =================================================================
// SESSION HISTORY
// =================================================================

function showSessionHistoryModal() {
    document.getElementById('session-history-modal').style.display = 'block';
    fetchAllSessions();
}

function closeSessionHistoryModal() { 
    document.getElementById('session-history-modal').style.display = 'none';
}

async function fetchAllSessions() {
    const searchTerm = document.getElementById('session-history-search').value.toLowerCase();
    const showArchived = document.getElementById('show-archived').checked;
    
    let query = supabaseClient.from('sessions').select('id, session_name, created_at, is_archived, courses(course_name)').eq('is_archived', showArchived).order('created_at', { ascending: false });
    if(searchTerm) query = query.ilike('session_name', `%${searchTerm}%`);

    const { data, error } = await query;
    allSessions = data || [];
    displaySessions();
}

function displaySessions() {
    const groupedSessions = allSessions.reduce((acc, session) => {
        const date = new Date(session.created_at).toLocaleDateString('en-CA');
        if (!acc[date]) acc[date] = [];
        acc[date].push(session);
        return acc;
    }, {});
    renderGroupedSessions(groupedSessions);
}

function renderGroupedSessions(groupedSessions) {
    const listDisplay = document.getElementById('session-list-display');
    listDisplay.innerHTML = Object.keys(groupedSessions).length === 0 ? '<div class="no-students-message">No sessions found.</div>' : '';

    for (const date in groupedSessions) {
        const sessions = groupedSessions[date];
        const dateGroup = document.createElement('details');
        dateGroup.className = 'session-date-group';
        dateGroup.innerHTML = `<summary class="session-date-summary"><span>${new Date(date).toDateString()}</span><span class="session-count">${sessions.length} Session(s)</span></summary>`;
        
        sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `<div><span>${session.session_name}</span><small>Course: ${session.courses?.course_name || 'General'}</small></div><div class="session-item-actions"><button class="action-btn" onclick="viewSessionDetails(${session.id}, '${session.session_name.replace(/'/g, "\\'")}')">View</button><button class="action-btn edit" onclick="editSession(${session.id}, '${session.session_name.replace(/'/g, "\\'")}')">Edit</button><button class="action-btn delete" onclick="archiveSession(${session.id}, '${session.session_name.replace(/'/g, "\\'")}')">Delete</button></div>`;
            dateGroup.appendChild(item);
        });
        listDisplay.appendChild(dateGroup);
    }
}

async function viewSessionDetails(sessionId, sessionName) {
    document.getElementById('session-list-container').style.display = 'none';
    const detailsContainer = document.getElementById('session-details-container');
    detailsContainer.style.display = 'block';
    document.getElementById('session-details-title').textContent = `Attendance for: ${sessionName}`;
    const detailsDisplay = document.getElementById('session-details-display');
    detailsDisplay.innerHTML = '<div class="student-item">Loading...</div>';

    const { data, error } = await supabaseClient.from('attendance').select('student, usn, timestamp').eq('session_id', sessionId).order('timestamp', { ascending: true });

    if (error || !data.length) {
        detailsDisplay.innerHTML = '<div class="no-students-message">No attendance recorded.</div>';
        return;
    }
    
    detailsDisplay.innerHTML = data.map(record => `<div class="student-item"><span>${record.student} <sub>${record.usn||''}</sub></span><span>${new Date(record.timestamp).toLocaleTimeString()}</span></div>`).join('');
}


function backToSessionList() {
    document.getElementById('session-details-container').style.display = 'none';
    document.getElementById('session-list-container').style.display = 'block';
}


// =================================================================
// MODALS (STUDENT & COURSE MANAGEMENT)
// =================================================================

function setupAllModalSearchListeners() {
    document.getElementById('student-list-search')?.addEventListener('input', (e) => populateStudentListDisplayWithFingerprint(e.target.value.toLowerCase().trim()));
    document.getElementById('student-search-manual')?.addEventListener('input', (e) => populateFacultyStudentDropdown(e.target.value.toLowerCase().trim()));
    document.getElementById('session-stats-search')?.addEventListener('input', (e) => fetchSessionStatistics(e.target.value.toLowerCase().trim()));
    document.getElementById('student-stats-search')?.addEventListener('input', (e) => fetchStudentStatistics(e.target.value.toLowerCase().trim()));
}

// Student Modals
function showStudentListModal() { 
    document.getElementById('student-list-modal').style.display = 'block';
    populateStudentListDisplayWithFingerprint();
}

function closeStudentListModal() { 
    document.getElementById('student-list-modal').style.display = 'none';
}

function showEditStudentModal(usn) {
    const student = allStudents.find(s => s.usn === usn);
    if(!student) return;

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
    const originalUsn = document.getElementById('edit-student-original-usn').value;
    const newName = document.getElementById('edit-student-name').value;
    const newUsn = document.getElementById('edit-student-usn').value;

    const { error } = await supabaseClient.from('students').update({ name: newName, usn: newUsn }).eq('usn', originalUsn);

    if (error) {
        alert('Error updating student: ' + error.message);
    } else {
        alert('Student details saved!');
        await fetchAllStudents();
        populateStudentListDisplayWithFingerprint();
        closeEditStudentModal();
    }
}

async function loadStudentFingerprints(usn) {
    const listDiv = document.getElementById('student-fingerprint-list');
    listDiv.innerHTML = 'Loading fingerprints...';
    
    const { data, error } = await supabaseClient.from('student_fingerprints').select('*').eq('student_usn', usn);

    if(error || !data.length) {
        listDiv.innerHTML = '<p>No fingerprints registered for this student.</p>';
        return;
    }

    listDiv.innerHTML = data.map(fp => `
        <div class="student-list-item">
            <span>Fingerprint registered on ${new Date(fp.registered_at).toLocaleDateString()}</span>
            <button class="delete-student-btn" onclick="deleteFingerprint('${fp.id}', '${usn}')">Delete</button>
        </div>
    `).join('');
}

async function deleteFingerprint(fingerprintId, studentUsn) {
    if(!confirm('Are you sure you want to delete this fingerprint?')) return;

    await supabaseClient.from('student_fingerprints').delete().eq('id', fingerprintId);
    loadStudentFingerprints(studentUsn);
}

async function populateStudentListDisplayWithFingerprint(searchTerm = '') {
    const display = document.getElementById('student-list-display');
    const countEl = document.getElementById('total-student-count');
    if (!display || !countEl) return;

    const studentsToDisplay = allStudents.filter(s => !searchTerm || s.name.toLowerCase().includes(searchTerm) || (s.usn && s.usn.toLowerCase().includes(searchTerm)));
    countEl.textContent = studentsToDisplay.length;

    const { data: fingerprintData } = await supabaseClient.from('student_fingerprints').select('student_usn, count');
    const fingerprintCounts = (fingerprintData || []).reduce((acc, { student_usn, count }) => ({ ...acc, [student_usn]: count }), {});

    display.innerHTML = studentsToDisplay.length === 0 ? '<div class="no-students-message">No students found.</div>' : '';
    
    studentsToDisplay.forEach(student => {
        const count = fingerprintCounts[student.usn] || 0;
        const item = document.createElement('div');
        item.className = 'student-list-item';
        item.innerHTML = `
            <div>
                <span>${student.name} <sub style="color: #666;">${student.usn}</sub></span>
                <div style="font-size: 12px; margin-top: 4px;">${count} fingerprint(s) registered</div>
            </div>
            <div>
                <button class="add-student-btn" style="background: #ffc107; color: #000;" onclick="showEditStudentModal('${student.usn}')">Manage</button>
                <button class="delete-student-btn" onclick="deleteStudent('${student.name}')">Delete</button>
            </div>`;
        display.appendChild(item);
    });
}

// Course Modals
function showCoursesModal() { 
    document.getElementById('courses-modal').style.display = 'block';
    populateCoursesList();
}

function closeCoursesModal() { 
    document.getElementById('courses-modal').style.display = 'none';
}

async function populateCoursesList() {
    const listDisplay = document.getElementById('courses-list-display');
    listDisplay.innerHTML = 'Loading courses...';
    const { data, error } = await supabaseClient.from('courses').select('*').order('id', { ascending: false });
    
    if (error || !data.length) {
        listDisplay.innerHTML = '<div class="no-students-message">No courses created yet.</div>';
        return;
    }
    
    listDisplay.innerHTML = data.map(course => `
        <div class="student-list-item">
            <div><span>${course.course_name}</span><small>ID: ${course.course_id || 'Not Set'}</small></div>
            <button class="delete-student-btn" onclick="deleteCourseFromList(${course.id}, '${course.course_name.replace(/'/g, "\\'")}')">Delete</button>
        </div>
    `).join('');
}

// Other Modals
function showAddManuallyModal() { 
    if (!currentSession) return alert('Please start a session first.');
    document.getElementById('add-manually-modal').style.display = 'block';
    populateFacultyStudentDropdown();
}

function closeAddManuallyModal() { 
    document.getElementById('add-manually-modal').style.display = 'none';
}

function populateFacultyStudentDropdown(searchTerm = '') {
    const dropdown = document.getElementById('student-dropdown');
    if (!dropdown) return;
    
    const unpresentStudents = allStudents.filter(s => !presentStudents.includes(s.name) && (!searchTerm || s.name.toLowerCase().includes(searchTerm) || (s.usn && s.usn.toLowerCase().includes(searchTerm))));
    
    dropdown.innerHTML = unpresentStudents.length === 0 ? '<div class="dropdown-item no-results">No available students found.</div>' : '';
    
    unpresentStudents.forEach(student => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.innerHTML = `${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub>`;
        item.onclick = () => addStudentManually(student.name, student.usn);
        dropdown.appendChild(item);
    });
}

// ... rest of the functions from previous response (submitAttendanceWithFingerprint, FINGERPRINT_CONFIG, etc.)
// I am omitting them here for brevity but they should be included in the final file.

// =================================================================
// FINGERPRINT & LOCATION (Proxy Prevention)
// =================================================================
const FINGERPRINT_CONFIG = {
    ENABLE_FINGERPRINT: true,
    REQUIRE_FINGERPRINT: true,
    MAX_FINGERPRINTS_PER_STUDENT: 1,
    FINGERPRINT_TIMEOUT: 60000,
    ALLOW_BACKUP_AUTH: false
};

const MOBILE_FRIENDLY_CONFIG = {
    ENABLE_LOCATION_CHECK: true,
    MAX_DISTANCE_FROM_ADMIN: 200,
    MIN_GPS_ACCURACY: 50,
};

// ... All fingerprint and location functions from the previous response go here ...

async function logout() {
    await supabaseClient.auth.signOut();
    localStorage.clear();
    window.location.href = 'login.html';
}
