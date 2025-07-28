// Global Supabase client
let supabaseClient = null;

// Global state variables
let allStudents = [];
let presentStudents = [];
let currentCourseId = null;
let currentSession = null;

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
            .select('student, usn, timestamp')
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

/**
 * The single source of truth for managing the active session state.
 */
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
    
    // Set up polling and event listeners
    setInterval(fetchCurrentSessionAttendance, 5000);
    setupAllModalSearchListeners();
    console.log('✅ Faculty view initialized');
}

function generateQR(sessionId) {
    const qrContainer = document.getElementById('qr-code-container');
    if (!qrContainer) {
        console.error('❌ QR container not found');
        return;
    }

    console.log('🔄 Generating QR code for session:', sessionId);
    qrContainer.innerHTML = '';
    
    try {
        const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;
        console.log('🔗 Student URL:', studentUrl);
        
        // Check if QRious is available
        if (typeof QRious === 'undefined') {
            console.error('❌ QRious library not loaded');
            qrContainer.innerHTML = '<p style="color: #dc3545; text-align: center; padding: 40px;">QR code library not loaded. Please refresh the page.</p>';
            return;
        }
        
        const canvas = document.createElement('canvas');
        qrContainer.appendChild(canvas);
        
        new QRious({
            element: canvas,
            value: studentUrl,
            size: 350,
            padding: 10,
            level: 'H',
            background: 'white',
            foreground: 'black'
        });
        
        console.log('✅ QR code generated successfully');
    } catch (error) {
        console.error('❌ QR generation error:', error);
        qrContainer.innerHTML = '<p style="color: #dc3545; text-align: center; padding: 40px;">Failed to generate QR code. Please try again.</p>';
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
        studentDiv.innerHTML = `
            <span>${record.student} <sub style="color: #666;">${record.usn || 'N/A'}</sub></span>
            <button class="remove-btn" onclick="removeStudentFromSession('${record.student.replace(/'/g, "\\'")}')">Remove</button>
        `;
        listElement.appendChild(studentDiv);
    });
}

function updatePresentCount(count) {
    const countElement = document.getElementById('present-count');
    if (countElement) {
        countElement.textContent = count;
    }
}

async function removeStudentFromSession(studentName) {
    if (!currentSession || !confirm(`Remove ${studentName} from this session?`)) return;
    
    try {
        const { error } = await supabaseClient
            .from('attendance')
            .delete()
            .match({ student: studentName, session_id: currentSession.id });
            
        if (error) throw error;
        fetchCurrentSessionAttendance();
        console.log('✅ Student removed:', studentName);
    } catch (err) {
        console.error('Error removing student:', err);
        alert('Failed to remove student: ' + err.message);
    }
}

// =================================================================
// STUDENT VIEW (`student.html`)
// =================================================================

function initStudentView() {
    console.log('🚀 Initializing student view...');
    populateStudentListForSelection();
    setupStudentEventListeners();
}

function populateStudentListForSelection(searchTerm = '') {
    const studentList = document.getElementById('student-list');
    if (!studentList) return;
    
    const studentsToDisplay = allStudents.filter(s => 
        searchTerm === '' || 
        s.name.toLowerCase().includes(searchTerm) || 
        (s.usn && s.usn.toLowerCase().includes(searchTerm))
    );
    
    studentList.innerHTML = '';
    if (studentsToDisplay.length === 0) {
        studentList.innerHTML = '<div class="no-results"><p>No students found</p></div>';
        return;
    }
    
    studentsToDisplay.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-checkbox';
        studentDiv.innerHTML = `
            <input type="radio" name="student" value="${student.name}" data-usn="${student.usn || ''}" id="student-${student.usn}">
            <label for="student-${student.usn}">${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub></label>
        `;
        studentList.appendChild(studentDiv);
    });
    
    studentList.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const submitBtn = document.getElementById('submit-attendance');
            if (submitBtn) submitBtn.disabled = false;
            
            document.querySelectorAll('.student-checkbox').forEach(box => 
                box.classList.remove('selected')
            );
            radio.parentElement.classList.add('selected');
        });
    });
}

function setupStudentEventListeners() {
    const submitBtn = document.getElementById('submit-attendance');
    const closeBtn = document.getElementById('close-success');
    const searchInput = document.getElementById('student-search');

    if (submitBtn) {
        submitBtn.addEventListener('click', submitAttendance);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => window.close());
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => 
            populateStudentListForSelection(e.target.value.toLowerCase().trim())
        );
    }
}

async function submitAttendance() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    if (!selectedRadio) {
        return alert("Please select your name.");
    }

    const sessionId = new URLSearchParams(window.location.search).get('session');
    if (!sessionId) {
        return alert("Invalid or missing session. Please scan the QR code again.");
    }

    const submitBtn = document.getElementById('submit-attendance');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
    }

    try {
        const { error } = await supabaseClient
            .from('attendance')
            .insert({
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
            const selectionPage = document.getElementById('student-selection-page');
            const successPage = document.getElementById('success-page');
            
            if (selectionPage) selectionPage.style.display = 'none';
            if (successPage) successPage.style.display = 'block';
            
            console.log('✅ Attendance submitted successfully');
        }
    } catch (err) {
        console.error('Attendance submission error:', err);
        alert("Failed to submit attendance: " + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Attendance';
        }
    }
}

// =================================================================
// SESSION MANAGEMENT (START NEW / HISTORY)
// =================================================================

async function showCourseSelectionModal() {
    try {
        const { data: courses, error } = await supabaseClient
            .from('courses')
            .select('id, course_name');
            
        if (error) throw error;
        
        if (!courses || courses.length === 0) {
            return alert('Please create a course first via the "Manage Courses" button.');
        }

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.onclick = (e) => { 
            if (e.target === modal) modal.remove(); 
        };
        
        let courseOptionsHTML = courses.map(course => 
            `<button class="modal-btn primary" style="margin: 10px; width: 80%;" onclick="startSessionForCourse(${course.id}, '${course.course_name.replace(/'/g, "\\'")}')">
                ${course.course_name}
            </button>`
        ).join('');
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Select a Course to Start Session</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div style="text-align: center;">
                    ${courseOptionsHTML}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    } catch (err) {
        console.error('Error fetching courses:', err);
        alert('Could not fetch courses: ' + err.message);
    }
}

async function startSessionForCourse(courseId, courseName) {
    const modal = document.querySelector('.modal');
    if (modal) modal.remove();
    
    const sessionName = prompt(
        `Enter a name for this session for "${courseName}":`, 
        `Session on ${new Date().toLocaleDateString()}`
    );
    
    if (!sessionName) return;

    try {
        const { data, error } = await supabaseClient
            .from('sessions')
            .insert({ 
                session_name: sessionName, 
                course_id: courseId 
            })
            .select('*, courses(course_name)')
            .single();
            
        if (error) throw error;
        
        updateActiveSession(data);
        alert(`✅ Session "${sessionName}" has started!`);
        console.log('✅ Session started:', data);
    } catch (err) {
        console.error('Error creating session:', err);
        alert("Failed to create session: " + err.message);
    }
}

function showSessionHistoryModal() {
    const modal = document.getElementById('session-history-modal');
    if (modal) {
        modal.style.display = 'block';
        backToSessionList();
        populateSessionHistory();
    }
}

function closeSessionHistoryModal() { 
    const modal = document.getElementById('session-history-modal');
    if (modal) modal.style.display = 'none';
}

function backToSessionList() {
    const listContainer = document.getElementById('session-list-container');
    const detailsContainer = document.getElementById('session-details-container');
    
    if (listContainer) listContainer.style.display = 'block';
    if (detailsContainer) detailsContainer.style.display = 'none';
}

async function populateSessionHistory() {
    const listDisplay = document.getElementById('session-list-display');
    if (!listDisplay) return;
    
    listDisplay.innerHTML = '<div class="student-item">Loading sessions...</div>';
    
    try {
        const { data, error } = await supabaseClient
            .from('sessions')
            .select('id, session_name, created_at, courses(course_name)')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        listDisplay.innerHTML = '';
        if (!data || data.length === 0) {
            listDisplay.innerHTML = '<div class="no-students-message">No past sessions found.</div>';
            return;
        }
        
        data.forEach(session => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            const courseName = session.courses ? session.courses.course_name : 'No Course';
            item.innerHTML = `
                <span class="student-name">
                    ${session.session_name}
                    <sub style="color: #6f42c1; display: block; margin-top: 5px;">${courseName}</sub>
                </span>
                <button class="add-student-btn" onclick="viewSessionDetails(${session.id}, '${session.session_name.replace(/'/g, "\\'")}')">
                    View
                </button>
            `;
            listDisplay.appendChild(item);
        });
    } catch (err) {
        console.error('Error loading session history:', err);
        listDisplay.innerHTML = '<div class="no-students-message">Could not load session history.</div>';
    }
}

async function viewSessionDetails(sessionId, sessionName) {
    const listContainer = document.getElementById('session-list-container');
    const detailsContainer = document.getElementById('session-details-container');
    const detailsDisplay = document.getElementById('session-details-display');
    const detailsTitle = document.getElementById('session-details-title');
    
    if (listContainer) listContainer.style.display = 'none';
    if (detailsContainer) detailsContainer.style.display = 'block';
    if (detailsTitle) detailsTitle.textContent = `Attendance for: ${sessionName}`;
    if (detailsDisplay) detailsDisplay.innerHTML = '<div class="student-item">Loading...</div>';
    
    try {
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, timestamp')
            .eq('session_id', sessionId)
            .order('timestamp', { ascending: true });
            
        if (error) throw error;
        
        if (!detailsDisplay) return;
        
        detailsDisplay.innerHTML = '';
        if (!data || data.length === 0) {
            detailsDisplay.innerHTML = '<div class="no-students-message">No attendance recorded.</div>';
            return;
        }
        
        data.forEach(record => {
            const item = document.createElement('div');
            item.className = 'student-item';
            item.innerHTML = `
                <span>${record.student} <sub style="color: #666;">${record.usn || ''}</sub></span>
                <span>${new Date(record.timestamp).toLocaleTimeString()}</span>
            `;
            detailsDisplay.appendChild(item);
        });
    } catch (err) {
        console.error('Error loading session details:', err);
        if (detailsDisplay) {
            detailsDisplay.innerHTML = '<div class="no-students-message">Could not load details.</div>';
        }
    }
}

// =================================================================
// MODALS (COURSES, STUDENTS, MANUAL ADD)
// =================================================================

function setupAllModalSearchListeners() {
    const studentListSearch = document.getElementById('student-list-search');
    const studentSearchManual = document.getElementById('student-search-manual');
    
    if (studentListSearch) {
        studentListSearch.addEventListener('input', (e) => 
            populateStudentListDisplay(e.target.value.toLowerCase().trim())
        );
    }
    
    if (studentSearchManual) {
        studentSearchManual.addEventListener('input', (e) => 
            populateFacultyStudentDropdown(e.target.value.toLowerCase().trim())
        );
    }
}

function showCoursesModal() { 
    const modal = document.getElementById('courses-modal');
    if (modal) {
        modal.style.display = 'block';
        backToCoursesList(); 
        populateCoursesList();
    }
}

function closeCoursesModal() { 
    const modal = document.getElementById('courses-modal');
    if (modal) modal.style.display = 'none';
}

function backToCoursesList() {
    const listView = document.getElementById('course-list-view');
    const managementView = document.getElementById('course-management-view');
    
    if (listView) listView.style.display = 'block';
    if (managementView) managementView.style.display = 'none';
    currentCourseId = null;
}
function renderCourseList(courses) {
    const listDisplay = document.getElementById('courses-list-display');
    if (!listDisplay) return;

    listDisplay.innerHTML = '';
    if (!courses || courses.length === 0) {
        listDisplay.innerHTML = '<div class="no-students-message">No courses created.</div>';
        return;
    }

    courses.forEach(course => {
        const item = document.createElement('div');
        item.className = 'student-list-item';
        item.innerHTML = `
            <span>${course.course_name}</span>
            <button class="add-student-btn" onclick="showCourseManagementView(${course.id}, '${course.course_name.replace(/'/g, "\\'")}')">
                Manage
            </button>
        `;
        listDisplay.appendChild(item);
    });
}

async function populateCoursesList() {
    const listDisplay = document.getElementById('courses-list-display');
    if (!listDisplay) return;

    listDisplay.innerHTML = '<div class="student-item">Loading...</div>';

    try {
        const { data, error } = await supabaseClient
            .from('courses')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        renderCourseList(data); // We now use our new function here

    } catch (err) {
        console.error('Error loading courses:', err);
        listDisplay.innerHTML = '<div class="no-students-message">Could not load courses.</div>';
    }
}

async function createNewCourse() {
    const courseNameInput = document.getElementById('new-course-name');
    if (!courseNameInput) return;

    const courseName = courseNameInput.value.trim();
    if (!courseName) {
        return alert('Please enter a course name.');
    }

    try {
        const { data, error } = await supabaseClient
            .from('courses')
            .insert({ course_name: courseName })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                alert(`Error: A course named "${courseName}" already exists.`);
            } else {
                throw error;
            }
        } else {
            courseNameInput.value = '';
            // This will re-fetch and display the updated list of all courses
            await populateCoursesList(); 
            alert(`Course "${data.course_name}" was created!`);
        }
    } catch (err) {
        console.error('Error creating course:', err);
        alert(`An unexpected error occurred: ${err.message}`);
    }
}
function showCourseManagementView(courseId, courseName) {
    currentCourseId = courseId;
    const listView = document.getElementById('course-list-view');
    const managementView = document.getElementById('course-management-view');
    const managementTitle = document.getElementById('course-management-title');
    
    if (listView) listView.style.display = 'none';
    if (managementView) managementView.style.display = 'block';
    if (managementTitle) managementTitle.textContent = `Managing: ${courseName}`;
    
    const searchInput = document.getElementById('add-student-search');
    if (searchInput) {
        searchInput.oninput = () => 
            populateAddStudentToCourseList(courseId, searchInput.value.trim().toLowerCase());
    }
    
    populateCourseStudentList(courseId);
    populateAddStudentToCourseList(courseId);
}

async function populateCourseStudentList(courseId) {
    const listDisplay = document.getElementById('course-student-list-display');
    if (!listDisplay) return;
    
    listDisplay.innerHTML = '<div class="student-item">Loading...</div>';
    
    try {
        const { data, error } = await supabaseClient
            .from('student_courses')
            .select(`students(name, usn)`)
            .eq('course_id', courseId);
            
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
            item.innerHTML = `
                <span>${student.name} <sub style="color:#666">${student.usn}</sub></span>
                <button class="remove-btn" onclick="removeStudentFromCourse('${student.usn}', ${courseId})">
                    Remove
                </button>
            `;
            listDisplay.appendChild(item);
        });
    } catch (err) { 
        console.error('Error fetching enrolled students:', err);
        listDisplay.innerHTML = '<div class="no-students-message">Error loading students.</div>';
    }
}

async function populateAddStudentToCourseList(courseId, searchTerm = '') {
    const addListDisplay = document.getElementById('add-student-to-course-display');
    if (!addListDisplay) return;
    
    addListDisplay.innerHTML = '<div class="student-item">Loading...</div>';
    
    try {
        const { data: enrolledData, error } = await supabaseClient
            .from('student_courses')
            .select('student_usn')
            .eq('course_id', courseId);
            
        if (error) throw error;
        
        const enrolledUsns = enrolledData.map(item => item.student_usn);
        let unenrolledStudents = allStudents.filter(student => 
            student.usn && !enrolledUsns.includes(student.usn)
        );
        
        if (searchTerm) {
            unenrolledStudents = unenrolledStudents.filter(s => 
                s.name.toLowerCase().includes(searchTerm) || 
                s.usn.toLowerCase().includes(searchTerm)
            );
        }
        
        addListDisplay.innerHTML = '';
        if (unenrolledStudents.length === 0) {
            addListDisplay.innerHTML = '<div class="no-students-message">No available students found.</div>';
            return;
        }
        
        unenrolledStudents.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `
                <span>${student.name} <sub style="color:#666">${student.usn}</sub></span>
                <button class="add-student-btn" onclick="addStudentToCourse('${student.usn}', ${courseId})">
                    Add
                </button>
            `;
            addListDisplay.appendChild(item);
        });
    } catch (err) { 
        console.error('Error populating students to add:', err);
        addListDisplay.innerHTML = '<div class="no-students-message">Error loading available students.</div>';
    }
}

async function addStudentToCourse(studentUsn, courseId) {
    try {
        const { error } = await supabaseClient
            .from('student_courses')
            .insert({ student_usn: studentUsn, course_id: courseId });
            
        if (error) throw error;
        
        populateCourseStudentList(courseId);
        populateAddStudentToCourseList(courseId);
        console.log('✅ Student added to course');
    } catch (err) { 
        console.error('Error adding student to course:', err);
        alert('Failed to add student to course: ' + err.message);
    }
}

async function removeStudentFromCourse(studentUsn, courseId) {
    try {
        const { error } = await supabaseClient
            .from('student_courses')
            .delete()
            .match({ student_usn: studentUsn, course_id: courseId });
            
        if (error) throw error;
        
        populateCourseStudentList(courseId);
        populateAddStudentToCourseList(courseId);
        console.log('✅ Student removed from course');
    } catch (err) { 
        console.error('Error removing student from course:', err);
        alert('Failed to remove student from course: ' + err.message);
    }
}

async function deleteCourse() {
    if (!currentCourseId || !confirm("⚠️ Permanently delete this course and all its enrollment records?")) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('courses')
            .delete()
            .eq('id', currentCourseId);
            
        if (error) throw error;
        
        backToCoursesList();
        populateCoursesList();
        console.log('✅ Course deleted');
    } catch (err) { 
        console.error('Error deleting course:', err);
        alert('Failed to delete course: ' + err.message);
    }
}

function showStudentListModal() { 
    const modal = document.getElementById('student-list-modal');
    if (modal) {
        modal.style.display = 'block';
        populateStudentListDisplay();
    }
}

function closeStudentListModal() { 
    const modal = document.getElementById('student-list-modal');
    if (modal) modal.style.display = 'none';
}

function populateStudentListDisplay(searchTerm = '') {
    const display = document.getElementById('student-list-display');
    const countEl = document.getElementById('total-student-count');
    if (!display || !countEl) return;

    const studentsToDisplay = allStudents.filter(s => 
        searchTerm === '' || 
        s.name.toLowerCase().includes(searchTerm) || 
        (s.usn && s.usn.toLowerCase().includes(searchTerm))
    );
    
    countEl.textContent = studentsToDisplay.length;
    display.innerHTML = '';
    
    if (studentsToDisplay.length === 0) {
        display.innerHTML = '<div class="no-students-message">No students found.</div>';
    } else {
        studentsToDisplay.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            item.innerHTML = `
                <span>${student.name} <sub style="color: #666;">${student.usn || 'N/A'}</sub></span>
                <button class="delete-student-btn" onclick="deleteStudent('${student.name.replace(/'/g, "\\'")}')">
                    🗑️ Delete
                </button>
            `;
            display.appendChild(item);
        });
    }
}

async function addNewStudent() {
    const nameInput = document.getElementById('new-student-name');
    const usnInput = document.getElementById('new-student-usn');
    
    if (!nameInput || !usnInput) return;
    
    const studentName = nameInput.value.trim();
    const studentUsn = usnInput.value.trim();
    
    if (!studentName || !studentUsn) {
        return alert('Student name and USN are required.');
    }
    
    if (allStudents.some(s => s.usn === studentUsn)) {
        return alert('A student with this USN already exists.');
    }
    
    try {
        const { error } = await supabaseClient
            .from('students')
            .insert({ name: studentName, usn: studentUsn });
            
        if (error) throw error;
        
        nameInput.value = ''; 
        usnInput.value = '';
        await fetchAllStudents();
        populateStudentListDisplay();
        console.log('✅ Student added:', studentName);
    } catch (err) { 
        console.error('Error adding student:', err);
        alert('Failed to add student: ' + err.message); 
    }
}

async function deleteStudent(studentName) {
    if (!confirm(`Permanently delete ${studentName}?`)) return;
    
    try {
        const { error } = await supabaseClient
            .from('students')
            .delete()
            .eq('name', studentName);
            
        if (error) throw error;
        
        await fetchAllStudents();
        populateStudentListDisplay();
        console.log('✅ Student deleted:', studentName);
    } catch (err) { 
        console.error('Error deleting student:', err);
        alert('Failed to delete student: ' + err.message); 
    }
}

function showAddManuallyModal() { 
    if (!currentSession) {
        return alert('Please start a session first before adding students manually.');
    }
    
    const modal = document.getElementById('add-manually-modal');
    if (modal) {
        modal.style.display = 'block';
        populateFacultyStudentDropdown();
    }
}

function closeAddManuallyModal() { 
    const modal = document.getElementById('add-manually-modal');
    if (modal) modal.style.display = 'none';
}

function populateFacultyStudentDropdown(searchTerm = '') {
    const dropdown = document.getElementById('student-dropdown');
    if (!dropdown) return;
    
    const unpresentStudents = allStudents.filter(s => 
        !presentStudents.includes(s.name) && 
        (searchTerm === '' || 
         s.name.toLowerCase().includes(searchTerm) || 
         (s.usn && s.usn.toLowerCase().includes(searchTerm)))
    );
    
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
    
    if (presentStudents.includes(studentName)) {
        return alert('Student already marked present.');
    }
    
    try {
        const { error } = await supabaseClient
            .from('attendance')
            .insert({ 
                student: studentName, 
                usn: studentUSN, 
                session_id: currentSession.id, 
                device_id: 'manual_admin' 
            });
            
        if (error) throw error;
        
        fetchCurrentSessionAttendance();
        closeAddManuallyModal();
        console.log('✅ Student added manually:', studentName);
    } catch (err) { 
        console.error('Error adding student manually:', err);
        alert('Failed to add student manually: ' + err.message); 
    }
}

async function exportAttendanceCSV() {
    if (!currentSession) {
        return alert("Please start a session to export attendance.");
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, timestamp')
            .eq('session_id', currentSession.id);
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            return alert("No attendance data to export for this session.");
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Student,USN,Timestamp,Session\n";
        csvContent += data.map(e => 
            `"${e.student}","${e.usn || ''}","${new Date(e.timestamp).toLocaleString()}","${currentSession.session_name}"`
        ).join("\n");
        
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `attendance_${currentSession.session_name}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('✅ Attendance exported');
    } catch (err) {
        console.error('Error exporting attendance:', err);
        alert('Failed to export attendance: ' + err.message);
    }
}

async function logout() {
    try {
        await supabaseClient.auth.signOut();
        localStorage.clear();
        window.location.href = 'login.html';
    } catch (err) {
        console.error('Logout error:', err);
        // Force logout even if there's an error
        localStorage.clear();
        window.location.href = 'login.html';
    }
}
