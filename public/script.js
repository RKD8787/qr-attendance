// Global Supabase client
let supabaseClient = null;

// Global state
let allStudents = [];
let presentStudents = [];
let filteredStudents = [];

// ✅ MAIN INITIALIZATION (This now runs everything)
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 DOM Content Loaded');
    
    // Determine the current page to decide which functions to run
    const currentPage = window.location.pathname;

    if (currentPage.includes('login.html')) {
        // Login page logic is self-contained in login.html, so do nothing here.
        return;
    }
    
    // For all other pages (index.html, student.html, etc.)
    initializeSupabaseAndApp();
});

// ✅ UNIFIED INITIALIZATION AND AUTH CHECK
async function initializeSupabaseAndApp() {
    // 1. Initialize Supabase Client
    try {
        const SUPABASE_URL = 'https://zpesqzstorixfsmpntsx.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ';
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('✅ Supabase client initialized');
    } catch (error) {
        console.error('❌ Supabase initialization error:', error);
        alert('FATAL: Supabase client could not be initialized. Check the console.');
        return;
    }

    // 2. Check Authentication
    const { data: { session } } = await supabaseClient.auth.getSession();
    const currentPage = window.location.pathname;

    // If there's no session and we are not on the student page, redirect to login
    if (!session && !currentPage.includes('student.html')) {
        window.location.href = 'login.html';
        return;
    }

    // 3. Run Page-Specific Logic
    await fetchAllStudents();
    
    if (currentPage.includes('student.html')) {
        initStudentView();
    } else if (currentPage.includes('index.html') || currentPage === '/') {
        initFacultyView();
    }
}


// Generate a unique device ID for this browser/device
function getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
}

// ✅ FETCH ALL STUDENTS FROM SUPABASE (Updated to include USN)
async function fetchAllStudents() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('students').select('name, usn').order('name', { ascending: true });
        if (error) throw error;
        allStudents = data; // Now stores objects with {name, usn}
        filteredStudents = [...allStudents];
        console.log('✅ Fetched students:', allStudents.length);
    } catch (err) {
        console.error('❌ Error fetching master student list:', err);
    }
}

// ✅ FETCH ATTENDANCE FROM SUPABASE
async function fetchAttendance() {
    if (!supabaseClient) return;
    try {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            console.log('No session ID found, creating one...');
            // If no session ID, create one. This is important for the QR code.
            localStorage.setItem('sessionId', Date.now().toString());
            generateQR(); // Generate QR with the new session ID
            return;
        }

        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, timestamp')
            .eq('session_id', sessionId)
            .order('timestamp', { ascending: false });

        if (error) throw error;

        presentStudents = data.map(record => record.student);
        updatePresentStudentsList(data);
        updatePresentCount();
        
    } catch (err) {
        console.error('❌ Error fetching attendance:', err);
    }
}

// ✅ UPDATE PRESENT STUDENTS LIST IN UI (Updated to show USN)
function updatePresentStudentsList(attendanceData) {
    const listElement = document.getElementById('present-students-list');
    if (!listElement) return;

    if (attendanceData.length === 0) {
        listElement.innerHTML = '<div class="student-item" style="opacity: 0.5; font-style: italic;">No students marked present yet</div>';
        return;
    }

    listElement.innerHTML = '';
    attendanceData.forEach(record => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-item';
        studentDiv.innerHTML = `
            <span>${record.student} <sub style="color: #666; font-size: 0.8em;">${record.usn || 'N/A'}</sub></span>
            <button class="remove-btn" onclick="removeStudent('${record.student}')">Remove</button>
        `;
        listElement.appendChild(studentDiv);
    });
}

// ✅ UPDATE PRESENT COUNT
function updatePresentCount() {
    const countElement = document.getElementById('present-count');
    if (countElement) {
        countElement.textContent = presentStudents.length;
    }
}

// ✅ REMOVE STUDENT FROM ATTENDANCE
async function removeStudent(studentName) {
    if (!confirm(`Remove ${studentName} from attendance?`)) return;
    
    try {
        const sessionId = localStorage.getItem('sessionId');
        const { error } = await supabaseClient
            .from('attendance')
            .delete()
            .eq('student', studentName)
            .eq('session_id', sessionId);

        if (error) throw error;
        
        console.log('✅ Student removed:', studentName);
        fetchAttendance(); // Refresh the list
    } catch (err) {
        console.error('❌ Error removing student:', err);
        alert('Failed to remove student.');
    }
}

// ✅ FACULTY VIEW INITIALIZATION
function initFacultyView() {
    console.log('🔄 Starting faculty view initialization...');
    if (!localStorage.getItem('sessionId')) {
        localStorage.setItem('sessionId', Date.now().toString());
    }
    generateQR();
    fetchAttendance();
    setInterval(fetchAttendance, 5000);
    updateStudentCount();
}

// ✅ STUDENT VIEW INITIALIZATION
function initStudentView() {
    populateStudentList();
    setupStudentEventListeners();
    setupStudentSearch();
}

// ✅ POPULATE STUDENT LIST FOR STUDENT VIEW (Updated to show USN)
function populateStudentList() {
    const studentList = document.getElementById('student-list');
    if (!studentList) return;

    studentList.innerHTML = '';

    if (filteredStudents.length === 0) {
        studentList.innerHTML = '<div class="no-results"><p>No students found</p></div>';
        return;
    }

    filteredStudents.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-checkbox';
        studentDiv.innerHTML = `
            <input type="radio" name="student" value="${student.name}" data-usn="${student.usn || ''}" id="student-${student.name}">
            <label for="student-${student.name}">
                ${student.name} <sub style="color: #666; font-size: 0.8em;">${student.usn || 'N/A'}</sub>
            </label>
        `;
        studentList.appendChild(studentDiv);
    });

    const radioButtons = studentList.querySelectorAll('input[type="radio"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', updateStudentSelection);
    });
}

// ✅ HANDLE STUDENT SELECTION
function updateStudentSelection() {
    const submitBtn = document.getElementById('submit-attendance');
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    
    if (submitBtn) {
        submitBtn.disabled = !selectedRadio;
    }

    const checkboxes = document.querySelectorAll('.student-checkbox');
    checkboxes.forEach(checkbox => {
        const radio = checkbox.querySelector('input[type="radio"]');
        if (radio && radio.checked) {
            checkbox.classList.add('selected');
        } else {
            checkbox.classList.remove('selected');
        }
    });
}

// ✅ SETUP STUDENT EVENT LISTENERS
function setupStudentEventListeners() {
    const submitBtn = document.getElementById('submit-attendance');
    const closeBtn = document.getElementById('close-success');
    
    if (submitBtn) {
        submitBtn.addEventListener('click', submitAttendance);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.close();
        });
    }
}

// ✅ QR CODE GENERATION (WITH SESSION ID)
function generateQR() {
    const qrCodeContainer = document.getElementById('qr-code');
    if (!qrCodeContainer) {
        console.error("QR container not found!");
        return;
    }

    qrCodeContainer.innerHTML = '<p>Generating QR code...</p>';

    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
        qrCodeContainer.innerHTML = '<p style="color: red;">No active session. Please click "Start Fresh Session".</p>';
        return;
    }

    if (typeof QRious === 'undefined') {
        qrCodeContainer.innerHTML = '<p style="color: red;">QR library is not loaded. Please refresh.</p>';
        return;
    }

    const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;

    qrCodeContainer.innerHTML = ''; 
    const canvas = document.createElement('canvas');
    qrCodeContainer.appendChild(canvas);

    new QRious({
        element: canvas,
        value: studentUrl,
        size: 340,
        padding: 15
    });

    console.log('✅ QR code generated for session:', sessionId);
}

// ✅ STUDENT SEARCH (Updated for objects with name and USN)
function setupStudentSearch() {
    const searchInput = document.getElementById('student-search');
    if (!searchInput) return;
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        filteredStudents = allStudents.filter(s => 
            s.name.toLowerCase().includes(searchTerm) || 
            (s.usn && s.usn.toLowerCase().includes(searchTerm))
        );
        populateStudentList();
    });
}

// ✅ REVISED: Export attendance CSV with USN
async function exportAttendanceCSV() {
    if (!supabaseClient) {
        alert("Database connection not available.");
        return;
    }
    try {
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, timestamp')
            .order('timestamp', { ascending: false });

        if (error) throw error;

        if (data.length === 0) {
            alert("No attendance data to export.");
            return;
        }
        
        const csvRows = ['"Name","USN","Timestamp"'];
        data.forEach(record => {
            const timestamp = new Date(record.timestamp).toLocaleString('en-US');
            csvRows.push(`"${record.student}","${record.usn || 'N/A'}","${timestamp}"`);
        });
        
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Attendance has been exported!');
    } catch (err) {
        console.error('❌ A critical error occurred during export:', err);
        alert('Failed to export attendance.');
    }
}

// ✅ SUBMIT ATTENDANCE (Updated with USN and device restriction)
async function submitAttendance() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    if (!selectedRadio) {
        alert("Please select your name first!");
        return;
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const currentSessionId = urlParams.get('session');
    
    if (!currentSessionId) {
        alert("Invalid or missing session. Please scan the QR code again.");
        return;
    }

    const deviceId = getDeviceId();
    const studentName = selectedRadio.value;
    const studentUSN = selectedRadio.getAttribute('data-usn') || '';

    const deviceSessionKey = `${deviceId}_${currentSessionId}`;
    if (localStorage.getItem(deviceSessionKey)) {
        alert("This device has already submitted attendance for this session.");
        return;
    }

    try {
        const { data: existingRecord, error: checkError } = await supabaseClient
            .from('attendance')
            .select('student')
            .eq('student', studentName)
            .eq('session_id', currentSessionId)
            .limit(1);

        if (checkError) throw checkError;

        if (existingRecord && existingRecord.length > 0) {
            alert("Attendance for this session has already been recorded for you.");
            return;
        }
    } catch (err) {
        console.error("❌ Error checking existing attendance:", err);
        alert("Error checking attendance status.");
        return;
    }

    const submitBtn = document.getElementById('submit-attendance');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const { error } = await supabaseClient
            .from('attendance')
            .insert({ 
                student: studentName,
                usn: studentUSN,
                session_id: currentSessionId,
                device_id: deviceId,
                timestamp: new Date().toISOString()
            });

        if (error) {
            if (error.code === '23505') { // Unique constraint violation
                alert("Attendance for this session has already been recorded.");
            } else {
                throw error;
            }
        } else {
            localStorage.setItem(deviceSessionKey, 'submitted');
            document.getElementById('student-selection-page').style.display = 'none';
            document.getElementById('success-page').style.display = 'block';
        }
    } catch (err) {
        console.error("❌ Submission error:", err);
        alert("Failed to submit attendance: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Attendance';
    }
}

// ✅ START FRESH SESSION - FIXED VERSION
async function startFreshAttendance() {
    if (!confirm("⚠️ This will clear ALL attendance records and start a new session. Continue?")) return;
    
    try {
        const { error } = await supabaseClient
            .from('attendance')
            .delete()
            .neq('student', 'this-is-a-dummy-value-that-will-never-exist'); // Match all records
        
        if (error) throw error;
        
        const newSessionId = Date.now().toString();
        localStorage.setItem('sessionId', newSessionId);
        
        presentStudents = [];
        
        const deviceId = getDeviceId();
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(deviceId + '_')) {
                localStorage.removeItem(key);
            }
        });
        
        await generateQR();
        updatePresentCount();
        updatePresentStudentsList([]);
        
        alert("✅ All attendance cleared! A new session has started.");
    } catch (err) {
        console.error("❌ Clear attendance error:", err);
        alert("Failed to clear attendance: " + err.message);
    }
}

// === STUDENT LIST MANAGEMENT (MODAL) === //
function showStudentListModal() {
    document.getElementById('student-list-modal').style.display = 'block';
    populateStudentListDisplay();
}

function closeStudentListModal() {
    document.getElementById('student-list-modal').style.display = 'none';
}

function updateStudentCount() {
    const countElement = document.getElementById('total-student-count');
    if(countElement) countElement.textContent = allStudents.length;
}

function populateStudentListDisplay() {
    const display = document.getElementById('student-list-display');
    if (!display) return;
    display.innerHTML = '';
    if (allStudents.length === 0) {
        display.innerHTML = '<div class="no-students-message">No students in the list</div>';
        return;
    }
    allStudents.forEach(student => {
        const item = document.createElement('div');
        item.className = 'student-list-item';
        item.innerHTML = `
            <span class="student-name">
                ${student.name} <sub style="color: #666; font-size: 0.8em;">${student.usn || 'N/A'}</sub>
            </span>
            <button class="delete-student-btn" onclick="deleteStudent('${student.name}')">
                🗑️ Delete
            </button>
        `;
        display.appendChild(item);
    });
    updateStudentCount();
}

async function addNewStudent() {
    const nameInput = document.getElementById('new-student-name');
    const usnInput = document.getElementById('new-student-usn');
    const studentName = nameInput.value.trim();
    const studentUSN = usnInput.value.trim();
    
    if (!studentName) {
        alert('Please enter a student name.');
        return;
    }
    
    if (allStudents.find(s => s.name.toLowerCase() === studentName.toLowerCase())) {
        alert('Student already exists.');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('students')
            .insert({ name: studentName, usn: studentUSN || null });
            
        if (error) throw error;
        nameInput.value = '';
        usnInput.value = '';
        alert(`${studentName} added successfully!`);
        await fetchAllStudents();
        populateStudentListDisplay();
    } catch(err) {
        console.error('❌ Error adding new student:', err);
        alert('Failed to add new student: ' + err.message);
    }
}

async function deleteStudent(studentName) {
    if (!confirm(`This will permanently delete ${studentName}. Continue?`)) return;
    try {
        const { error } = await supabaseClient.from('students').delete().eq('name', studentName);
        if (error) throw error;
        await removeStudent(studentName);
        alert(`${studentName} deleted successfully!`);
        await fetchAllStudents();
        populateStudentListDisplay();
    } catch(err) {
        console.error('❌ Error deleting student:', err);
        alert('Failed to delete student: ' + err.message);
    }
}

// === MANUAL ATTENDANCE (MODAL) === //
function showAddManuallyModal() {
    document.getElementById('add-manually-modal').style.display = 'block';
    populateFacultyStudentDropdown();
    setupFacultyStudentSearch();
}

function closeAddManuallyModal() {
    document.getElementById('add-manually-modal').style.display = 'none';
}

function setupFacultyStudentSearch() {
    const searchInput = document.getElementById('student-search');
    if (!searchInput) return;
    searchInput.addEventListener('input', (e) => {
        populateFacultyStudentDropdown(e.target.value.toLowerCase().trim());
    });
}

function populateFacultyStudentDropdown(searchTerm = '') {
    const dropdown = document.getElementById('student-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    const unpresentStudents = allStudents.filter(s => 
        !presentStudents.includes(s.name) && 
        (s.name.toLowerCase().includes(searchTerm) || 
         (s.usn && s.usn.toLowerCase().includes(searchTerm)))
    );
    if (unpresentStudents.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'dropdown-item no-results';
        noResults.textContent = searchTerm ? 'No matching students found' : 'All students are present';
        dropdown.appendChild(noResults);
        return;
    }
    unpresentStudents.forEach(student => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.innerHTML = `${student.name} <sub style="color: #666; font-size: 0.8em;">${student.usn || 'N/A'}</sub>`;
        item.onclick = () => addStudentManually(student.name, student.usn);
        dropdown.appendChild(item);
    });
}

async function addStudentManually(studentName, studentUSN) {
    if (!studentName) return;
    if (presentStudents.includes(studentName)) {
        alert('Student is already marked present!');
        return;
    }
    try {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            alert('No active session.');
            return;
        }
        const { error } = await supabaseClient
            .from('attendance')
            .insert({ 
                student: studentName,
                usn: studentUSN || '',
                session_id: sessionId,
                device_id: 'manual_admin',
                timestamp: new Date().toISOString()
            });
        if (error) throw error;
        alert(`${studentName} added successfully!`);
        fetchAttendance();
        closeAddManuallyModal();
    } catch(err) {
        console.error('❌ Add manually error:', err);
        alert('Failed to add student manually: ' + err.message);
    }
}

// === UTILITY === //
async function logout() {
    if (!supabaseClient) {
        localStorage.clear();
        window.location.href = 'login.html';
        return;
    }
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        console.error('Error logging out:', error);
        alert('Failed to log out.');
    } else {
        localStorage.clear();
        window.location.href = 'login.html';
    }
}

function showPage(pageId) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    const selectedPage = document.getElementById(pageId + '-page');
    if (selectedPage) {
        selectedPage.classList.add('active');
    }
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`[onclick="showPage('${pageId}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}
