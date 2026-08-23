import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as FormData from 'form-data';

@Injectable()
export class AiService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('AiService');
  }

  async transcribeAudio(filePath: string): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured in environment');
      throw new BadRequestException('OPENAI_NOT_CONFIGURED');
    }

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
      this.logger.error(`Audio file not found at path: ${absolutePath}`);
      throw new BadRequestException('AUDIO_FILE_NOT_FOUND');
    }

    const model =
      this.configService.get<string>('OPENAI_TRANSCRIPTION_MODEL') || 'whisper-1';

    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(absolutePath));
      formData.append('model', model);
      formData.append('language', 'ru');

      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 60000,
        },
      );

      if (!response.data || !response.data.text) {
        throw new Error('Empty response from OpenAI transcription service');
      }

      this.logger.log(`Successfully transcribed audio file: ${filePath}`);
      return response.data.text.trim();
    } catch (error: any) {
      const safeErrorMessage =
        error.response?.data?.error?.message || error.message || 'Unknown transcription error';
      this.logger.error(`OpenAI Transcription failure: ${safeErrorMessage}`);

      if (safeErrorMessage === 'OPENAI_NOT_CONFIGURED') {
        throw new BadRequestException('OPENAI_NOT_CONFIGURED');
      }

      throw new InternalServerErrorException(
        `TRANSCRIPTION_FAILED: ${safeErrorMessage}`,
      );
    }
  }
}
