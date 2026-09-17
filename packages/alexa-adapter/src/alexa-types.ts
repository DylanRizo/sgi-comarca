export interface AlexaResolvedValue {
  value: {
    id?: string;
    name: string;
  };
}

export interface AlexaSlot {
  name: string;
  value?: string;
  resolutions?: {
    resolutionsPerAuthority?: readonly {
      status: { code: string };
      values?: readonly AlexaResolvedValue[];
    }[];
  };
}

export interface AlexaIntent {
  name: string;
  confirmationStatus?: string;
  slots?: Readonly<Record<string, AlexaSlot | undefined>>;
}

export interface AlexaRequestEnvelope {
  version: string;
  request: {
    type: string;
    requestId?: string;
    locale?: string;
    intent?: AlexaIntent;
  };
  session?: {
    new: boolean;
    sessionId: string;
  };
}

export interface AlexaOutputSpeech {
  type: 'PlainText';
  text: string;
}

export interface AlexaElicitSlotDirective {
  type: 'Dialog.ElicitSlot';
  slotToElicit: string;
  updatedIntent?: AlexaIntent;
}

export interface AlexaSkillResponse {
  outputSpeech?: AlexaOutputSpeech;
  reprompt?: { outputSpeech: AlexaOutputSpeech };
  directives?: readonly AlexaElicitSlotDirective[];
  shouldEndSession?: boolean;
}

export interface AlexaResponseEnvelope {
  version: '1.0';
  response: AlexaSkillResponse;
}
