// --- Starfield Background Animation ---
const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');
let stars = [];

function initStars() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    stars = [];
    // 모바일에서는 성능을 위해 별 개수 조절
    const starCount = window.innerWidth < 600 ? 80 : 150;
    for(let i=0; i<starCount; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            radius: Math.random() * 1.5,
            speed: Math.random() * 0.5 + 0.1
        });
    }
}

function drawStars() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    stars.forEach(s => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI*2);
        ctx.fill();
        s.y -= s.speed;
        if(s.y < 0) {
            s.y = canvas.height;
            s.x = Math.random() * canvas.width;
        }
    });
    requestAnimationFrame(drawStars);
}
window.addEventListener('resize', initStars);
initStars();
drawStars();

// --- Web Audio API & Sequencer Logic ---
let audioCtx, masterGain, delay, dest, mediaRecorder;
let chunks = [];
let isPlaying = false;
let isRecording = false;
let currentStep = 0;
let intervalId;
const numSteps = 16;
const numRows = 8;

const frequencies = [698.46, 622.25, 523.25, 466.16, 392.00, 349.23, 311.13, 261.63];

const gridEl = document.getElementById('sequencer-grid');
for(let row = 0; row < numRows; row++) {
    for(let col = 0; col < numSteps; col++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = `cell-${row}-${col}`;
        
        // 모바일 터치 이벤트 대응 (click 이벤트보다 반응성 좋음)
        const toggleCell = (e) => {
            e.preventDefault(); // 터치 시 스크롤 방지 등 기본 동작 막기
            
            // 모바일 오디오 정책 우회: 첫 상호작용 시 AudioContext 활성화
            if(!audioCtx) initAudio();
            if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

            cell.classList.toggle('active');
            if(cell.classList.contains('active')) {
                playNote(frequencies[row]);
            }
        };

        // 데스크탑은 click, 모바일은 touchstart 사용
        cell.addEventListener('click', toggleCell);
        cell.addEventListener('touchstart', toggleCell, {passive: false});

        gridEl.appendChild(cell);
    }
}

function initAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.5;

    delay = audioCtx.createDelay();
    delay.delayTime.value = 0.35; 
    const feedback = audioCtx.createGain();
    feedback.gain.value = 0.4;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;

    delay.connect(feedback);
    feedback.connect(filter);
    filter.connect(delay);
    delay.connect(masterGain);

    masterGain.connect(audioCtx.destination);

    dest = audioCtx.createMediaStreamDestination();
    masterGain.connect(dest);
}

function playNote(frequency) {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const noteGain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);

    osc.connect(noteGain);
    noteGain.connect(masterGain);
    noteGain.connect(delay); 

    osc.start();
    
    noteGain.gain.setValueAtTime(0, audioCtx.currentTime);
    noteGain.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.05);
    noteGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
    
    osc.stop(audioCtx.currentTime + 1.2);
}

function step() {
    for(let r = 0; r < numRows; r++) {
        const prevStep = currentStep === 0 ? numSteps - 1 : currentStep - 1;
        document.getElementById(`cell-${r}-${prevStep}`).classList.remove('playing');
    }

    for(let r = 0; r < numRows; r++) {
        const cell = document.getElementById(`cell-${r}-${currentStep}`);
        cell.classList.add('playing');
        if(cell.classList.contains('active')) {
            playNote(frequencies[r]);
        }
    }
    
    // 모바일에서 재생 중인 위치가 화면 밖으로 나가면 자동으로 스크롤
    const activeCell = document.getElementById(`cell-0-${currentStep}`);
    const container = document.querySelector('.grid-container');
    if(activeCell && container) {
        const cellLeft = activeCell.offsetLeft;
        const containerScrollLeft = container.scrollLeft;
        const containerWidth = container.offsetWidth;
        
        if (cellLeft < containerScrollLeft || cellLeft > containerScrollLeft + containerWidth - 32) {
             container.scrollTo({
                left: cellLeft - 15,
                behavior: 'smooth'
            });
        }
    }

    currentStep = (currentStep + 1) % numSteps;
}

function togglePlay() {
    if(!audioCtx) initAudio();
    if(audioCtx.state === 'suspended') audioCtx.resume();

    const btn = document.getElementById('playBtn');
    if(isPlaying) {
        clearInterval(intervalId);
        isPlaying = false;
        btn.innerText = '▶ 재생 (Play)';
        document.querySelectorAll('.cell').forEach(c => c.classList.remove('playing'));
    } else {
        isPlaying = true;
        btn.innerText = '■ 정지 (Stop)';
        currentStep = 0;
        intervalId = setInterval(step, 250);
    }
}

function clearGrid() {
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('active', 'playing'));
}

function toggleRecording() {
    if(!audioCtx) initAudio();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    
    const btn = document.getElementById('recBtn');
    const dlBtn = document.getElementById('downloadBtn');

    if(!isRecording) {
        chunks = [];
        let options = { mimeType: 'audio/webm;codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            // iOS 사파리의 경우 오디오 녹음 포맷 지원이 제한적일 수 있음
            options = MediaRecorder.isTypeSupported('audio/mp4') ? { mimeType: 'audio/mp4' } : { mimeType: '' }; 
        }
        
        try {
            mediaRecorder = new MediaRecorder(dest.stream, options);
            mediaRecorder.ondataavailable = (e) => {
                if(e.data.size > 0) chunks.push(e.data);
            };
            mediaRecorder.start();
            
            isRecording = true;
            btn.innerText = '■ 녹음 중지';
            btn.style.color = '#ff4a4a';
            dlBtn.style.display = 'none';
            
            if(!isPlaying) togglePlay();
        } catch(e) {
            alert('현재 브라우저 환경에서는 녹음 기능을 지원하지 않습니다.');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btn.innerText = '● 녹음 시작';
        btn.style.color = '#66fcf1';
        dlBtn.style.display = 'inline-block';
    }
}

function stopAndDownload() {
    if(chunks.length === 0) return;
    // 확장자 자동 결정
    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `galaxy_melody.${ext}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// --- Modals Logic ---
function openModal(id) {
    document.getElementById('overlay').style.display = 'block';
    document.getElementById(id).style.display = 'block';
}
function closeModals() {
    document.getElementById('overlay').style.display = 'none';
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

