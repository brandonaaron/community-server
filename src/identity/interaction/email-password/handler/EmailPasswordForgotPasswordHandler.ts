import assert from 'assert';
import { getLoggerFor } from '../../../../logging/LogUtil';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { trimTrailingSlashes } from '../../../../util/PathUtil';
import type { IdPInteractionHttpHandlerInput } from '../../IdPInteractionHttpHandler';
import { IdPInteractionHttpHandler } from '../../IdPInteractionHttpHandler';
import { getFormDataRequestBody } from '../../util/getFormDataRequestBody';
import type { IdpRenderHandler } from '../../util/IdpRenderHandler';
import type { EmailPasswordStorageAdapter } from '../storage/EmailPasswordStorageAdapter';

export interface EmailPasswordForgotPasswordHandlerArgs {
  renderHandler: IdpRenderHandler;
  messageRenderHandler: IdpRenderHandler;
  emailPasswordStorageAdapter: EmailPasswordStorageAdapter;
  baseUrl: string;
}

export class EmailPasswordForgotPasswordHandler extends IdPInteractionHttpHandler {
  private readonly renderHandler: IdpRenderHandler;
  private readonly messageRenderHandler: IdpRenderHandler;
  private readonly emailPasswordStorageAdapter: EmailPasswordStorageAdapter;
  private readonly baseUrl: string;
  private readonly logger = getLoggerFor(this);

  public constructor(args: EmailPasswordForgotPasswordHandlerArgs) {
    super();
    this.renderHandler = args.renderHandler;
    this.messageRenderHandler = args.messageRenderHandler;
    this.emailPasswordStorageAdapter = args.emailPasswordStorageAdapter;
    this.baseUrl = args.baseUrl;
  }

  private async sendResponse(
    input: HttpHandlerInput,
    interactionDetails: { uid: string },
    email: string,
  ): Promise<void> {
    // Send response
    await this.messageRenderHandler.handle({
      response: input.response,
      props: {
        details: interactionDetails,
        errorMessage: '',
        prefilled: {
          email,
        },
      },
    });
  }

  public async handle(input: IdPInteractionHttpHandlerInput): Promise<void> {
    const interactionDetails = await input.provider.interactionDetails(
      input.request,
      input.response,
    );
    try {
      // Validate incoming data
      const { email } = await getFormDataRequestBody(input.request);

      // Qualify email
      assert(email && typeof email === 'string', 'Email required');

      // Create forgot password confirmation record
      let recordId: string;
      try {
        recordId = await this.emailPasswordStorageAdapter.generateForgotPasswordConfirmationRecord(
          email,
        );
      } catch {
        await this.sendResponse(input, interactionDetails, email);
        return;
      }
      const resetLink = `${trimTrailingSlashes(
        this.baseUrl,
      )}/resetpassword?rid=${recordId}`;

      // Send email
      this.logger.info(`Reset link: ${resetLink}`);

      await this.sendResponse(input, interactionDetails, email);
    } catch (err: unknown) {
      const errorMessage: string =
        err instanceof Error ? err.message : 'An unknown error occurred';
      await this.renderHandler.handle({
        response: input.response,
        props: {
          details: interactionDetails,
          errorMessage,
          prefilled: {},
        },
      });
    }
  }
}
