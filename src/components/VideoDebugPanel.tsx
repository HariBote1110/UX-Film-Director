import React, { useEffect, useState } from 'react';
import { VideoFrameProvider, VideoProviderDebugState } from '../utils/VideoFrameProvider';

interface Props {
    providers: Map<string, VideoFrameProvider>;
    currentTime: number;
}

const VideoDebugPanel: React.FC<Props> = ({ providers, currentTime }) => {
    const [stats, setStats] = useState<Record<string, VideoProviderDebugState>>({});
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const interval = setInterval(() => {
            const newStats: Record<string, VideoProviderDebugState> = {};
            providers.forEach((provider, id) => {
                newStats[id] = provider.getDebugState();
            });
            setStats(newStats);
        }, 100); // 100msごとに更新

        return () => clearInterval(interval);
    }, [providers]);

    const handleDownloadLog = () => {
        providers.forEach((provider, id) => {
            console.log(`Downloading log for ${id}`);
            provider.downloadLog();
        });
    };

    if (!visible) {
        return (
            <div style={{ position: 'fixed', top: 10, right: 10, zIndex: 99999 }}>
                <button onClick={() => setVisible(true)} style={{ background: 'black', color: 'white' }}>Show Debug</button>
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            top: 10,
            right: 10,
            width: '400px',
            background: 'rgba(0, 0, 0, 0.8)',
            color: '#0f0',
            padding: '10px',
            fontFamily: 'monospace',
            fontSize: '12px',
            zIndex: 99999,
            border: '1px solid #0f0',
            maxHeight: '90vh',
            overflowY: 'auto'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong>Video Debugger</strong>
                <div>
                    <button onClick={handleDownloadLog} style={{ marginRight: 5 }}>Save Log</button>
                    <button onClick={() => setVisible(false)}>Hide</button>
                </div>
            </div>
            
            <div>App Time: {currentTime.toFixed(3)}s</div>
            <hr style={{ borderColor: '#333' }} />

            {Object.entries(stats).length === 0 && <div>No Video Providers</div>}

            {Object.entries(stats).map(([id, stat]) => (
                <div key={id} style={{ marginBottom: '10px', padding: '5px', border: '1px solid #333' }}>
                    <div style={{ color: 'yellow' }}>ID: {id.slice(0, 8)}...</div>
                    <div>Ready: {stat.ready ? 'YES' : 'NO'}</div>
                    <div>Samples: {stat.samplesCount}</div>
                    <div>Decoded Queue: {stat.queueSize} frames</div>
                    <div>Decoder Internal: {stat.decoderQueueSize}</div>
                    <div>Next Index: {stat.nextDecodeIndex}</div>
                    <div>Is Filling: {stat.isFilling ? 'BUSY' : 'IDLE'}</div>
                    {stat.bufferedRange ? (
                        <div>
                            Buffer: {stat.bufferedRange.start.toFixed(2)}s - {stat.bufferedRange.end.toFixed(2)}s
                            <br/>
                            (Gap from Time: {(stat.bufferedRange.start - currentTime).toFixed(2)}s)
                        </div>
                    ) : (
                        <div style={{ color: 'red' }}>Buffer Empty</div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default VideoDebugPanel;