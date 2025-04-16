let mediaRecorder;
let audioChunks = [];
let audioSegments = [];
let isRecording = false;
let isPlaying = false;
let currentPlaylist = [];

// DOM 元素
const recordButton = document.getElementById('recordButton');
const recordingStatus = document.getElementById('recordingStatus');
const originalAudio = document.getElementById('originalAudio');
const splitButton = document.getElementById('splitButton');
const playRandomButton = document.getElementById('playRandomButton');
const stopPlaybackButton = document.getElementById('stopPlaybackButton');
const saveButton = document.getElementById('saveButton');
const segmentLengthInput = document.getElementById('segmentLength');
const segmentsContainer = document.getElementById('segments');

// 录音功能
recordButton.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            console.log('请求麦克风权限...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('麦克风权限已获取，Stream:', stream);
            
            const audioTracks = stream.getAudioTracks();
            console.log('音频轨道:', audioTracks);
            if (audioTracks.length === 0) {
                console.error('错误：获取到的流中没有音频轨道！');
                recordingStatus.textContent = '错误：无音频轨道';
                return;
            }
            console.log('音频轨道状态:', audioTracks[0].readyState, '启用:', audioTracks[0].enabled);

            mediaRecorder = new MediaRecorder(stream);
            console.log('MediaRecorder 已创建:', mediaRecorder);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                console.log('ondataavailable 事件触发，数据大小:', event.data.size);
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                console.log('onstop 事件触发，总数据块数量:', audioChunks.length);
                if (audioChunks.length === 0) {
                    console.error('错误：没有收集到任何音频数据块！');
                    recordingStatus.textContent = '错误：未录制到数据';
                    splitButton.disabled = true;
                    return;
                }
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                console.log('录音完成，Blob 大小:', audioBlob.size, '类型:', audioBlob.type);
                if (audioBlob.size < 1000) { // 小于1KB通常意味着是空的或接近空的
                    console.warn('警告：录制的 Blob 文件非常小，可能为空。');
                }
                originalAudio.src = URL.createObjectURL(audioBlob);
                splitButton.disabled = false;
                console.log('原始音频元素 src 已设置');
            };

            mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder 错误:', event.error);
                recordingStatus.textContent = `录音错误: ${event.error.name}`;
                isRecording = false;
                recordButton.textContent = '开始录音';
                recordButton.classList.remove('recording');
            };

            mediaRecorder.start();
            console.log('MediaRecorder 已启动');
            isRecording = true;
            recordButton.textContent = '停止录音';
            recordButton.classList.add('recording');
            recordingStatus.textContent = '正在录音...';
        } catch (err) {
            console.error('录音失败 (getUserMedia 或后续步骤):', err);
            recordingStatus.textContent = `无法访问麦克风: ${err.name}`;
        }
    } else {
        console.log('尝试停止录音...');
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            console.log('MediaRecorder 已停止');
        } else {
            console.warn('警告：MediaRecorder 不存在或状态不是 recording', mediaRecorder ? mediaRecorder.state : 'undefined');
        }
        // 停止所有音轨，释放麦克风
        if (mediaRecorder && mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            console.log('所有媒体轨道已停止');
        }
        isRecording = false;
        recordButton.textContent = '开始录音';
        recordButton.classList.remove('recording');
        recordingStatus.textContent = '录音已完成';
    }
});

// 切割音频
splitButton.addEventListener('click', async () => {
    try {
        const segmentLength = parseFloat(segmentLengthInput.value);
        // 验证片段长度是否在有效范围内
        if (isNaN(segmentLength) || segmentLength < 0.1 || segmentLength > 2.0) {
            alert('请输入有效的片段长度（0.1秒到2.0秒之间）');
            return;
        }

        // 创建音频上下文
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 获取原始音频数据
        const audioUrl = originalAudio.src;
        if (!audioUrl) {
            alert('请先录制音频');
            return;
        }

        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        
        try {
            // 解码音频数据
            const audioBuffer = await new Promise((resolve, reject) => {
                audioContext.decodeAudioData(arrayBuffer, resolve, reject);
            });

            // 确保音频长度足够进行切割
            if (audioBuffer.duration < segmentLength) {
                alert('录音时间太短，请录制更长的音频或减小片段长度');
                return;
            }

            const numberOfSegments = Math.floor(audioBuffer.duration / segmentLength);
            audioSegments = [];
            segmentsContainer.innerHTML = '';

            // 添加进度提示
            const statusDiv = document.createElement('div');
            statusDiv.className = 'status';
            statusDiv.textContent = '正在处理音频...';
            segmentsContainer.appendChild(statusDiv);

            for (let i = 0; i < numberOfSegments; i++) {
                const startTime = i * segmentLength;
                const segmentBuffer = audioContext.createBuffer(
                    audioBuffer.numberOfChannels,
                    Math.floor(segmentLength * audioContext.sampleRate),
                    audioContext.sampleRate
                );

                // 复制音频数据到新的缓冲区
                for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                    const channelData = audioBuffer.getChannelData(channel);
                    const segmentData = segmentBuffer.getChannelData(channel);
                    const offset = Math.floor(startTime * audioContext.sampleRate);
                    
                    for (let j = 0; j < segmentBuffer.length && (j + offset) < channelData.length; j++) {
                        segmentData[j] = channelData[j + offset];
                    }
                }

                // 将音频片段转换为 Blob
                const wavBlob = audioBufferToWav(segmentBuffer);
                audioSegments.push(wavBlob);

                // 创建音频片段预览
                const segmentElement = document.createElement('div');
                segmentElement.className = 'segment';
                const audio = document.createElement('audio');
                audio.controls = true;
                audio.src = URL.createObjectURL(wavBlob);
                
                // 添加片段标签
                const label = document.createElement('div');
                label.className = 'segment-label';
                label.textContent = `片段 ${i + 1} (${segmentLength}秒)`;
                
                segmentElement.appendChild(label);
                segmentElement.appendChild(audio);
                segmentsContainer.appendChild(segmentElement);

                // 更新进度
                statusDiv.textContent = `正在处理音频... ${Math.round((i + 1) / numberOfSegments * 100)}%`;
            }

            // 移除进度提示
            statusDiv.remove();

            // 启用播放和保存按钮
            playRandomButton.disabled = false;
            stopPlaybackButton.disabled = false;
            saveButton.disabled = false;

        } catch (decodeError) {
            console.error('音频解码失败:', decodeError);
            alert('音频处理失败，请重试');
        }
    } catch (error) {
        console.error('切割过程出错:', error);
        alert('音频切割失败，请重试');
    }
});

// 随机播放功能
playRandomButton.addEventListener('click', () => {
    if (!isPlaying) {
        isPlaying = true;
        currentPlaylist = [...audioSegments].sort(() => Math.random() - 0.5);
        playNextSegment();
        playRandomButton.textContent = '暂停播放';
    } else {
        isPlaying = false;
        playRandomButton.textContent = '随机播放';
    }
});

stopPlaybackButton.addEventListener('click', () => {
    isPlaying = false;
    currentPlaylist = [];
    playRandomButton.textContent = '随机播放';
});

function playNextSegment() {
    if (!isPlaying || currentPlaylist.length === 0) {
        isPlaying = false;
        playRandomButton.textContent = '随机播放';
        return;
    }

    const segment = currentPlaylist.shift();
    const audio = new Audio(URL.createObjectURL(segment));
    audio.onended = playNextSegment;
    audio.play();
}

// 保存混音功能
saveButton.addEventListener('click', async () => {
    if (audioSegments.length === 0) return;

    const randomSegments = [...audioSegments].sort(() => Math.random() - 0.5);
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    let totalLength = 0;

    try {
        // 显示保存进度
        const statusDiv = document.createElement('div');
        statusDiv.className = 'status';
        statusDiv.textContent = '正在处理音频...';
        segmentsContainer.appendChild(statusDiv);

        // 计算总长度
        for (let i = 0; i < randomSegments.length; i++) {
            const segment = randomSegments[i];
            const arrayBuffer = await segment.arrayBuffer();
            const audioBuffer = await new Promise((resolve, reject) => {
                audioContext.decodeAudioData(arrayBuffer, resolve, reject);
            });
            totalLength += audioBuffer.length;

            // 更新进度
            statusDiv.textContent = `正在计算音频长度... ${Math.round((i + 1) / randomSegments.length * 50)}%`;
        }

        // 创建最终的音频缓冲区
        const finalBuffer = audioContext.createBuffer(
            2, // numberOfChannels
            totalLength,
            audioContext.sampleRate
        );

        let offset = 0;
        for (let i = 0; i < randomSegments.length; i++) {
            const segment = randomSegments[i];
            const arrayBuffer = await segment.arrayBuffer();
            const audioBuffer = await new Promise((resolve, reject) => {
                audioContext.decodeAudioData(arrayBuffer, resolve, reject);
            });
            
            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                const channelData = audioBuffer.getChannelData(channel);
                const finalData = finalBuffer.getChannelData(channel);
                for (let j = 0; j < audioBuffer.length; j++) {
                    finalData[j + offset] = channelData[j];
                }
            }
            offset += audioBuffer.length;

            // 更新进度
            statusDiv.textContent = `正在合成音频... ${Math.round(50 + (i + 1) / randomSegments.length * 50)}%`;
        }

        // 转换为WAV并保存
        statusDiv.textContent = '正在保存音频...';
        const finalBlob = audioBufferToWav(finalBuffer);
        const url = URL.createObjectURL(finalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '随机混音_' + new Date().toISOString().slice(0, 19).replace(/[-:]/g, '') + '.wav';
        a.click();

        // 移除进度提示
        statusDiv.remove();
    } catch (error) {
        console.error('保存混音失败:', error);
        alert('保存混音失败，请重试');
    }
});

// 辅助函数：将 AudioBuffer 转换为 WAV 格式
function audioBufferToWav(buffer) {
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;

    const wav = new ArrayBuffer(44 + buffer.length * blockAlign);
    const view = new DataView(wav);

    // WAV 文件头
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + buffer.length * blockAlign, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, buffer.length * blockAlign, true);

    const channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sample = Math.max(-1, Math.min(1, channels[channel][i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += bytesPerSample;
        }
    }

    return new Blob([wav], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
} 
