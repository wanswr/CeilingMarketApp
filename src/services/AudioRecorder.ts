import { Audio } from 'expo-av';

export interface AudioRecordingResult {
  uri: string;
  durationMs: number;
}

class AudioRecorder {
  private recording: Audio.Recording | null = null;
  private sound: Audio.Sound | null = null;

  async requestPermissions(): Promise<boolean> {
    try {
      const permission = await Audio.requestPermissionsAsync();
      return permission.granted;
    } catch (error) {
      console.error('[AudioRecorder] Error requesting permissions:', error);
      return false;
    }
  }

  async startRecording(): Promise<void> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Microphone permission not granted');
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      this.recording = recording;
    } catch (error) {
      console.error('[AudioRecorder] Failed to start recording:', error);
      throw error;
    }
  }

  async stopRecording(): Promise<AudioRecordingResult> {
    if (!this.recording) {
      throw new Error('No active recording found');
    }

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      const status = await this.recording.getStatusAsync();
      this.recording = null;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      if (!uri) {
        throw new Error('Recording URI is null');
      }

      return {
        uri,
        durationMs: status.durationMillis || 0,
      };
    } catch (error) {
      console.error('[AudioRecorder] Failed to stop recording:', error);
      this.recording = null;
      throw error;
    }
  }

  async playAudio(uri: string, onPlaybackStatusUpdate?: (status: any) => void): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.unloadAsync();
        this.sound = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        onPlaybackStatusUpdate,
      );
      this.sound = sound;
    } catch (error) {
      console.error('[AudioRecorder] Failed to play audio:', error);
      throw error;
    }
  }

  async stopAudio(): Promise<void> {
    if (this.sound) {
      await this.sound.stopAsync();
      await this.sound.unloadAsync();
      this.sound = null;
    }
  }
}

export const audioRecorder = new AudioRecorder();
