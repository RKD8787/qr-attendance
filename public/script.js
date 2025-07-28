// Global Supabase client
let supabaseClient = null;

// Global state variables
let allStudents = [];
let presentStudents = [];
let currentCourseId = null; // Used for the course management modal
let currentSession = null;  // Holds all info about the currently active session

// ✅ MAIN ENTRY POINT
document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * Initializes the Supabase client, checks auth, fetches data, and starts the correct UI.
 */
async function initializeApp() {
    try {
        const SUPABASE_URL = 'https://zpesqzstorixfsmpntsx.supabase.co';
        // ✅ CORRECTED, VALID API KEY
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ';
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (error) {
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
        const { data, error } = await supabaseClient.from('students').select('name, usn').order('name', { ascending: true });
        if (error) throw error;
        allStudents = data;
    } catch (err) {
        console.error('Error fetching students:', err);
    }
}

async function fetchCurrentSessionAttendance() {
    if (!currentSession) {
        updatePresentStudentsList([]); // Clear list if no active session
        return;
    };

    try {
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, timestamp')
            .eq('session_id', currentSession.id)
            .order('timestamp', { ascending: false });

        if (error) throw error;
        presentStudents = data.map(record => record.student);
        updatePresentStudentsList(data);
    } catch (err) {
        console.error('Error fetching attendance:', err);
    }
}

/**
 * The single source of truth for managing the active session state.
 * @param {object | null} sessionData - The session object from the database, or null to end a session.
 */
function updateActiveSession(sessionData) {
    currentSession = sessionData;
    const qrContainer = document.getElementById('qr-code-container');
    const sessionTitle = document.getElementById('current-session-title');

    if (sessionData) {
        localStorage.setItem('sessionId', sessionData.id);
        const courseName = sessionData.courses ? sessionData.courses.course_name : 'General';
        sessionTitle.textContent = `Active Session: ${sessionData.session_name} (${courseName})`;
        generateQR(sessionData.id);
        fetchCurrentSessionAttendance();
    } else {
        localStorage.removeItem('sessionId');
        sessionTitle.textContent = 'No Active Session';
        qrContainer.innerHTML = '<p style="color: #999;">Start a new session to generate a QR code.</p>';
        updatePresentStudentsList([]);
    }
}


// =================================================================
// FACULTY VIEW (`index.html`)
// =================================================================

function initFacultyView() {
    const lastSessionId = localStorage.getItem('sessionId');
    if (lastSessionId) {
        // On page load, try to resume the last session
        supabaseClient.from('sessions').select('*, courses(course_name)').eq('id', lastSessionId).single().then(({data}) => {
            if (data) {
                updateActiveSession(data);
            } else {
                updateActiveSession(null); // Clear state if session is not found
            }
        });
    } else {
        updateActiveSession(null); // Ensure clean state on first load
    }
    
    // Set up polling and event listeners
    setInterval(fetchCurrentSessionAttendance, 5000);
    setupAllModalSearchListeners();
}

function generateQR(sessionId) {
    const qrContainer = document.getElementById('qr-code-container');
    if (!qrContainer) return;

    qrContainer.innerHTML = ''; // Clear previous QR or message
    const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;
    
    new QRious({
        element: qrContainer.appendChild(document.createElement('canvas')),
        value: studentUrl,
        size: 250,
        padding: 10,
        level: 'H'
    });
    console.log(`✅ QR code generated for session ${sessionId}`);
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
        studentDiv.innerHTML = `<span>${record.student} <sub style="color: #666;">${record.usn || 'N/A'}</sub></span><button class="remove-btn" onclick="removeStudentFromSession('${record.student}')">Remove</button>`;
        listElement.appendChild(studentDiv);
    });
}

function updatePresentCount(count) {
    document.getElementById('present-count').textContent = count;
}

async function removeStudentFromSession(studentName) {
    if (!currentSession || !confirm(`Remove ${studentName} from this session?`)) return;
    try {
        await supabaseClient.from('attendance').delete().match({ student: studentName, session_id: currentSession.id });
        fetchCurrentSessionAttendance(); // Refresh the list
    } catch (err) {
        console.error('Error removing student:', err);
    }
}


// =================================================================
// STUDENT VIEW (`student.html`)
// =================================================================

function initStudentView() {
    populateStudentListForSelection();
    setupStudentEventListeners();
}

function populateStudentListForSelection(searchTerm = '') {
    const studentList = document.getElementById('student-list');
    if (!studentList) return;
    
    const studentsToDisplay = allStudents.filter(s => searchTerm === '' || s.name.toLowerCase().includes(searchTerm) || (s.usn && s.usn.toLowerCase().includes(searchTerm)));
    
    studentList.innerHTML = '';
    if (studentsToDisplay.length === 0) {
        studentList.innerHTML = '<div class="no-results"><p>No students found</p></div>';
        return;
    }
    studentsToDisplay.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-checkbox';
        studentDiv.innerHTML = `<input type="radio" name="student" value="${student.name}" data-usn="${student.usn || ''}" id="student-${student.usn}"><label for="student-${student.usn}">${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub></label>`;
        studentList.appendChild(studentDiv);
    });
    studentList.querySelectorAll('input[type="radio"]').forEach(radio => radio.addEventListener('change', () => {
        document.getElementById('submit-attendance').disabled = false;
        document.querySelectorAll('.student-checkbox').forEach(box => box.classList.remove('selected'));
        radio.parentElement.classList.add('selected');
    }));
}

function setupStudentEventListeners() {
    document.getElementById('submit-attendance')?.addEventListener('click', submitAttendance);
    document.getElementById('close-success')?.addEventListener('click', () => window.close());
    document.getElementById('student-search')?.addEventListener('input', (e) => populateStudentListForSelection(e.target.value.toLowerCase().trim()));
}

async function submitAttendance() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    if (!selectedRadio) return alert("Please select your name.");

    const sessionId = new URLSearchParams(window.location.search).get('session');
    if (!sessionId) return alert("Invalid or missing session. Please scan the QR code again.");

    const submitBtn = document.getElementById('submit-attendance');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const { error } = await supabaseClient.from('attendance').insert({
            student: selectedRadio.value,
            usn: selectedRadio.getAttribute('data-usn'),
            session_id: sessionId,
            device_id: 'student_device'
        });

        if (error?.code === '23505') {
            alert("You have already submitted your attendance for this session.");
        } else if (error) {
            throw error;
        } else {
            document.getElementById('student-selection-page').style.display = 'none';
            document.getElementById('success-page').style.display = 'block';
        }
    } catch (err) {
        alert("Failed to submit attendance: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Attendance';
    }
}

// =================================================================
// SESSION MANAGEMENT (START NEW / HISTORY)
// =================================================================

async function showCourseSelectionModal() {
    const { data: courses, error } = await supabaseClient.from('courses').select('id, course_name');
    if (error || !courses) return alert('Could not fetch courses.');
    if (courses.length === 0) return alert('Please create a course first via the "Manage Courses" button.');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
    
    let courseOptionsHTML = courses.map(course => `<button class="modal-btn primary" style="margin: 10px; width: 80%;" onclick="startSessionForCourse(${course.id}, '${course.course_name}')">${course.course_name}</button>`).join('');
    
    modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3>Select a Course to Start Session</h3><button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button></div><div style="text-align: center;">${courseOptionsHTML}</div></div>`;
    document.body.appendChild(modal);
}

async function startSessionForCourse(courseId, courseName) {
    document.querySelector('.modal').remove();
    const sessionName = prompt(`Enter a name for this session for "${courseName}":`, `Session on ${new Date().toLocaleDateString()}`);
    if (!sessionName) return;

    try {
        const { data, error } = await supabaseClient.from('sessions').insert({ session_name: sessionName, course_id: courseId }).select('*, courses(course_name)').single();
        if (error) throw error;
        updateActiveSession(data);
        alert(`✅ Session "${sessionName}" has started!`);
    } catch (err) {
        alert("Failed to create session: " + err.message);
    }
}

function showSessionHistoryModal() {
    document.getElementById('session-history-modal').style.display = 'block';
    backToSessionList();
    populateSessionHistory();
}

function closeSessionHistoryModal() { document.getElementById('session-history-modal').style.display = 'none'; }
function backToSessionList() {
    document.getElementById('session-list-container').style.display = 'block';
    document.getElementById('session-details-container').style.display = 'none';
}

async function populateSessionHistory() {
    const listDisplay = document.getElementById('session-list-display');
    listDisplay.innerHTML = '<div class="student-item">Loading sessions...</div>';
    try {
        const { data, error } = await supabaseClient.from('sessions').select('id, session_name, created_at, courses(course_name)').order('created_at', { ascending: false });
        if (error) throw error;
        listDisplay.innerHTML = '';
        if (data.length === 0) {
            listDisplay.innerHTML = '<div class="no-students-message">No past sessions found.</div>';
            return;
        }
        data.forEach(session => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            const courseName = session.courses ? session.courses.course_name : 'No Course';
            item.innerHTML = `
                <span class="student-name">${session.session_name}<sub style="color: #6f42c1; display: block; margin-top: 5px;">${courseName}</sub></span>
                <button class="add-student-btn" onclick="viewSessionDetails(${session.id}, '${session.session_name}')">View</button>`;
            listDisplay.appendChild(item);
        });
    } catch (err) {
        listDisplay.innerHTML = '<div class="no-students-message">Could not load session history.</div>';
    }
}

async function viewSessionDetails(sessionId, sessionName) {
    document.getElementById('session-list-container').style.display = 'none';
    document.getElementById('session-details-container').style.display = 'block';
    const detailsDisplay = document.getElementById('session-details-display');
    document.getElementById('session-details-title').textContent = `Attendance for: ${sessionName}`;
    detailsDisplay.innerHTML = '<div class="student-item">Loading...</div>';
    try {
        const { data, error } = await supabaseClient.from('session_attendance').select('student, usn, timestamp').eq('session_id', sessionId).order('timestamp', { ascending: true });
        if (error) throw error;
        detailsDisplay.innerHTML = '';
        if (data.length === 0) {
            detailsDisplay.innerHTML = '<div class="no-students-message">No attendance recorded.</div>';
            return;
        }
        data.forEach(record => {
            const item = document.createElement('div');
            item.className = 'student-item';
            item.innerHTML = `<span>${record.student} <sub style="color: #666;">${record.usn || ''}</sub></span><span>${new Date(record.timestamp).toLocaleTimeString()}</span>`;
            detailsDisplay.appendChild(item);
        });
    } catch (err) {
        detailsDisplay.innerHTML = '<div class="no-students-message">Could not load details.</div>';
    }
}

// =================================================================
// MODALS (COURSES, STUDENTS, MANUAL ADD)
// =================================================================

function setupAllModalSearchListeners() {
    document.getElementById('student-list-search')?.addEventListener('input', (e) => populateStudentListDisplay(e.target.value.toLowerCase().trim()));
    document.getElementById('student-search-manual')?.addEventListener('input', (e) => populateFacultyStudentDropdown(e.target.value.toLowerCase().trim()));
}

function showCoursesModal() { document.getElementById('courses-modal').style.display = 'block'; backToCoursesList(); populateCoursesList(); }
function closeCoursesModal() { document.getElementById('courses-modal').style.display = 'none'; }
function backToCoursesList() {
    document.getElementById('course-list-view').style.display = 'block';
    document.getElementById('course-management-view').style.display = 'none';
    currentCourseId = null;
}

async function populateCoursesList() {
    const listDisplay = document.getElementById('courses-list-display');
    listDisplay.innerHTML = '<div class="student-item">Loading...</div>';
    try {
        const { data, error } = await supabaseClient.from('courses').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        listDisplay.innerHTML = '';
        if (data.length === 0) {
            listDisplay.innerHTML = '<div class="no-students-message">No courses created.</div>';
            return;
        }
        data.forEach(course => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `<span>${course.course_name}</span><button class="add-student-btn" onclick="showCourseManagementView(${course.id}, '${course.course_name}')">Manage</button>`;
            listDisplay.appendChild(item);
        });
    } catch (err) {
        listDisplay.innerHTML = '<div class="no-students-message">Could not load courses.</div>';
    }
}

async function createNewCourse() {
    const courseNameInput = document.getElementById('new-course-name');
    const courseName = courseNameInput.value.trim();
    if (!courseName) return alert('Please enter a course name.');

    try {
        const { data, error } = await supabaseClient.from('courses').insert({ course_name: courseName }).select().single();
        if (error) {
            if (error.code === '23505') alert(`Error: A course named "${courseName}" already exists.`);
            else throw error;
        } else {
            courseNameInput.value = '';
            populateCoursesList();
            alert(`Course "${data.course_name}" was created!`);
        }
    } catch (err) {
        console.error('Error creating course:', err);
        alert(`An unexpected error occurred: ${err.message}`);
    }
}

function showCourseManagementView(courseId, courseName) {
    currentCourseId = courseId;
    document.getElementById('course-list-view').style.display = 'none';
    document.getElementById('course-management-view').style.display = 'block';
    document.getElementById('course-management-title').textContent = `Managing: ${courseName}`;
    const searchInput = document.getElementById('add-student-search');
    searchInput.oninput = () => populateAddStudentToCourseList(courseId, searchInput.value.trim().toLowerCase());
    populateCourseStudentList(courseId);
    populateAddStudentToCourseList(courseId);
}

async function populateCourseStudentList(courseId) {
    const listDisplay = document.getElementById('course-student-list-display');
    listDisplay.innerHTML = '<div class="student-item">Loading...</div>';
    try {
        const { data, error } = await supabaseClient.from('student_courses').select(`students(name, usn)`).eq('course_id', courseId);
        if (error) throw error;
        const enrolledStudents = data.map(item => item.students).filter(Boolean);
        listDisplay.innerHTML = '';
        if (enrolledStudents.length === 0) {
            listDisplay.innerHTML = '<div class="no-students-message">No students enrolled.</div>';
            return;
        }
        enrolledStudents.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `<span>${student.name} <sub style="color:#666">${student.usn}</sub></span><button class="remove-btn" onclick="removeStudentFromCourse('${student.usn}', ${courseId})">Remove</button>`;
            listDisplay.appendChild(item);
        });
    } catch (err) { console.error('Error fetching enrolled students:', err); }
}

async function populateAddStudentToCourseList(courseId, searchTerm = '') {
    const addListDisplay = document.getElementById('add-student-to-course-display');
    addListDisplay.innerHTML = '<div class="student-item">Loading...</div>';
    try {
        const { data: enrolledData, error } = await supabaseClient.from('student_courses').select('student_usn').eq('course_id', courseId);
        if (error) throw error;
        const enrolledUsns = enrolledData.map(item => item.student_usn);
        let unenrolledStudents = allStudents.filter(student => student.usn && !enrolledUsns.includes(student.usn));
        if (searchTerm) {
            unenrolledStudents = unenrolledStudents.filter(s => s.name.toLowerCase().includes(searchTerm) || s.usn.toLowerCase().includes(searchTerm));
        }
        addListDisplay.innerHTML = '';
        if (unenrolledStudents.length === 0) {
            addListDisplay.innerHTML = '<div class="no-students-message">No available students found.</div>';
            return;
        }
        unenrolledStudents.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `<span>${student.name} <sub style="color:#666">${student.usn}</sub></span><button class="add-student-btn" onclick="addStudentToCourse('${student.usn}', ${courseId})">Add</button>`;
            addListDisplay.appendChild(item);
        });
    } catch (err) { console.error('Error populating students to add:', err); }
}

async function addStudentToCourse(studentUsn, courseId) {
    try {
        await supabaseClient.from('student_courses').insert({ student_usn: studentUsn, course_id: courseId });
        populateCourseStudentList(courseId);
        populateAddStudentToCourseList(courseId);
    } catch (err) { console.error('Error adding student to course:', err); }
}

async function removeStudentFromCourse(studentUsn, courseId) {
    try {
        await supabaseClient.from('student_courses').delete().match({ student_usn: studentUsn, course_id: courseId });
        populateCourseStudentList(courseId);
        populateAddStudentToCourseList(courseId);
    } catch (err) { console.error('Error removing student from course:', err); }
}

async function deleteCourse() {
    if (!currentCourseId || !confirm("⚠️ Permanently delete this course and all its enrollment records?")) return;
    try {
        await supabaseClient.from('courses').delete().eq('id', currentCourseId);
        backToCoursesList();
        populateCoursesList();
    } catch (err) { alert('Failed to delete course.'); }
}

function showStudentListModal() { document.getElementById('student-list-modal').style.display = 'block'; populateStudentListDisplay(); }
function closeStudentListModal() { document.getElementById('student-list-modal').style.display = 'none'; }

function populateStudentListDisplay(searchTerm = '') {
    const display = document.getElementById('student-list-display');
    const countEl = document.getElementById('total-student-count');
    if (!display || !countEl) return;

    const studentsToDisplay = allStudents.filter(s => searchTerm === '' || s.name.toLowerCase().includes(searchTerm) || (s.usn && s.usn.toLowerCase().includes(searchTerm)));
    countEl.textContent = studentsToDisplay.length;
    display.innerHTML = '';
    
    if (studentsToDisplay.length === 0) {
        display.innerHTML = '<div class="no-students-message">No students found.</div>';
    } else {
        studentsToDisplay.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `<span>${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub></span><button class="delete-student-btn" onclick="deleteStudent('${student.name}')">🗑️ Delete</button>`;
            display.appendChild(item);
        });
    }
}

async function addNewStudent() {
    const nameInput = document.getElementById('new-student-name');
    const usnInput = document.getElementById('new-student-usn');
    const studentName = nameInput.value.trim();
    const studentUsn = usnInput.value.trim();
    if (!studentName || !studentUsn) return alert('Student name and USN are required.');
    if (allStudents.some(s => s.usn === studentUsn)) return alert('A student with this USN already exists.');
    try {
        await supabaseClient.from('students').insert({ name: studentName, usn: studentUsn });
        nameInput.value = ''; usnInput.value = '';
        await fetchAllStudents();
        populateStudentListDisplay();
    } catch (err) { alert('Failed to add student: ' + err.message); }
}

async function deleteStudent(studentName) {
    if (!confirm(`Permanently delete ${studentName}?`)) return;
    try {
        await supabaseClient.from('students').delete().eq('name', studentName);
        await fetchAllStudents();
        populateStudentListDisplay();
    } catch (err) { alert('Failed to delete student: ' + err.message); }
}

function showAddManuallyModal() { document.getElementById('add-manually-modal').style.display = 'block'; populateFacultyStudentDropdown(); }
function closeAddManuallyModal() { document.getElementById('add-manually-modal').style.display = 'none'; }

function populateFacultyStudentDropdown(searchTerm = '') {
    const dropdown = document.getElementById('student-dropdown');
    if (!dropdown) return;
    const unpresentStudents = allStudents.filter(s => !presentStudents.includes(s.name) && (searchTerm === '' || s.name.toLowerCase().includes(searchTerm) || (s.usn && s.usn.toLowerCase().includes(searchTerm))));
    dropdown.innerHTML = '';
    if (unpresentStudents.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-item no-results">No available students found.</div>';
    } else {
        unpresentStudents.forEach(student => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.innerHTML = `${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub>`;
            item.onclick = () => addStudentManually(student.name, student.usn);
            dropdown.appendChild(item);
        });
    }
}

async function addStudentManually(studentName, studentUSN) {
    if (!currentSession || !studentName) return;
    if (presentStudents.includes(studentName)) return alert('Student already marked present.');
    try {
        await supabaseClient.from('attendance').insert({ student: studentName, usn: studentUSN, session_id: currentSession.id, device_id: 'manual_admin' });
        fetchCurrentSessionAttendance();
        closeAddManuallyModal();
    } catch (err) { alert('Failed to add student manually.'); }
}

async function exportAttendanceCSV() {
    if (!currentSession) return alert("Please start a session to export attendance.");
    const { data, error } = await supabaseClient.from('session_attendance').select('student, usn, timestamp, session_name').eq('session_id', currentSession.id);
    if (error || !data || data.length === 0) return alert("No attendance data to export for this session.");

    let csvContent = "data:text/csv;charset=utf-8," + "Student,USN,Timestamp,Session\n" + data.map(e => `"${e.student}","${e.usn || ''}","${new Date(e.timestamp).toLocaleString()}","${e.session_name}"`).join("\n");
    
    var link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `attendance_${data[0].session_name}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function logout() {
    await supabaseClient.auth.signOut();
    localStorage.clear();
    window.location.href = 'login.html';
}
