import { Firebot, ScriptModules } from "@crowbartools/firebot-custom-scripts-types";
import { ReplaceVariableManager } from "@crowbartools/firebot-custom-scripts-types/types/modules/replace-variable-manager";
import { votingSystemEffectType } from "./effects/main-effect";
import { votingSystemUpdateEffectType } from "./effects/updater-effect";
import { votingSystemBackupEffectType } from "./effects/backup-effect";
import { VotingSystemEventSource } from "./events/voting-system-events";
import { HttpServerManager } from "@crowbartools/firebot-custom-scripts-types/types/modules/http-server-manager";
import { FrontendCommunicator } from "@crowbartools/firebot-custom-scripts-types/types/modules/frontend-communicator";
import { initLogger, logger } from "./logger";
import { Request, Response } from "express";
import votingSystemHtml from "./overlay/voting-system.html";
import { createVotingManager, votingManager } from "./utility/voting-manager";
import { PollOption } from './types/types';
import * as pollVariables from "./variables/voting-system-variables";
import { FirebotSettings } from '@crowbartools/firebot-custom-scripts-types/types/settings';

interface Params { }

// Export the modules with proper initialization
export let webServer: HttpServerManager;
export let frontendCommunicator: FrontendCommunicator;
export let modules: ScriptModules;
export let replaceVariableManager: ReplaceVariableManager;
export let settings: FirebotSettings;

const script: Firebot.CustomScript<Params> = {
    getScriptManifest: () => {
        return {
            name: "Advanced Poll System",
            description: "Highly Customizable Voting/Poll System for Firebot",
            author: "MorningStarGG",
            version: "1.0",
            firebotVersion: "5",
        };
    },
    getDefaultParameters: () => {
        return {};
    },
    run: (runRequest) => {
        // Store modules globally
        modules = runRequest.modules;
        webServer = runRequest.modules.httpServer;
        frontendCommunicator = runRequest.modules.frontendCommunicator;
        replaceVariableManager = runRequest.modules.replaceVariableManager;
        settings = runRequest.firebot.settings;

        // Initialize logging
        initLogger(runRequest.modules.logger);
        logger.info("Advanced Poll System Script is loading...");

        // Set up frontend communicator events
        runRequest.modules.frontendCommunicator.on(
            "add-custom-variable",
            (newVar: any) => {
                return runRequest.modules.customVariableManager.addCustomVariable(
                    newVar.name,
                    newVar.data,
                    newVar.ttl,
                    newVar.propertyPath
                );
            }
        );

        // Register HTTP route for serving the voting system overlay
        webServer.registerCustomRoute(
            "voting-system",
            "voting-system.html",
            "GET",
            (req: Request, res: Response) => {
                res.setHeader('content-type', 'text/html');
                res.end(votingSystemHtml);
            }
        );

        createVotingManager(modules.path.join(SCRIPTS_DIR, '..', 'db', 'votingSystem.db'), modules);

        //Clean Up old polls from the backup system
        setInterval(() => {
            votingManager.cleanupOldBackups();
        }, 24 * 60 * 60 * 1000); // Check once per day

        votingManager.cleanupOldBackups();

        //Check for and handle end of polls
        let isProcessingPolls = false;

        const checkEndingPolls = async () => {
            if (isProcessingPolls) return;

            try {
                isProcessingPolls = true;
                const activePolls = await votingManager.getActivePolls();

                for (const pollId of activePolls) {
                    const poll = await votingManager.getPoll(pollId);
                    if (!poll?.closeTime || poll.ended || new Date(poll.closeTime).getTime() > Date.now()) {
                        continue;
                    }

                    try {
                        // Stop the poll with the automatic flag
                        await votingManager.stopPoll(pollId, 'automatic', modules.eventManager);

                        // Handle the UI closure
                        await votingManager.checkAndClosePoll(pollId);
                    } catch (error) {
                        logger.error('Error in poll ending process:', error);
                        // Try to recover the poll state
                        await votingManager.startPoll(pollId, modules.eventManager)
                    }
                }
            } catch (error) {
                logger.error('Error in checkEndingPolls:', error);
            } finally {
                isProcessingPolls = false;
            }
        };
        setInterval(checkEndingPolls, 1000);

        //Poll Event Handlers
        const pollEventHandlers = {
            getActivePolls: async () => {
                return await votingManager.getActivePolls();
            },
            getEndedPolls: async () => {
                return await votingManager.getEndedPolls();
            },
            getAllPollsWithStatus: async () => {
                return await votingManager.getAllPollsWithStatus();
            },
            getPollData: async (pollId: string) => {
                return await votingManager.getPoll(pollId);
            },
            updatePollOptions: async ({ pollId, options }: { pollId: string, options: any[] }) => {
                return await votingManager.updateOptions(pollId, options);
            },
            removePoll: async ({ pollId }: { pollId: string }) => {
                return await votingManager.removePoll(pollId);
            },
            getBackupPolls: async () => {
                return await votingManager.getBackupPolls();
            },
            restorePoll: async ({ backupId, mode }: { backupId: string; mode?: 'merge' | 'overwrite' }) => {
                return await votingManager.restorePoll(backupId, mode);
            },
            checkPollExists: async ({ pollId }: { pollId: string }) => {
                return await votingManager.checkPollExists(pollId);
            },
            getRemovedOptions: async (pollId: string) => {
                return await votingManager.getRemovedOptions(pollId);
            },
            storeRemovedOption: async ({ pollId, option }: { pollId: string, option: PollOption }) => {
                return await votingManager.storeRemovedOption(pollId, option);
            },
            restoreOption: async ({ pollId, optionNumber }: { pollId: string; optionNumber: number }) => {
                return await votingManager.restoreOption(pollId, optionNumber);
            },
            updateRemovedOptionName: async ({ pollId, optionNumber, newName }: { pollId: string, optionNumber: number, newName: string }) => {
                return await votingManager.updateRemovedOptionName(pollId, optionNumber, newName);
            },
            getRemovedOptionsFormatted: async (pollId: string) => {
                return await votingManager.getRemovedOptionsFormatted(pollId);
            },
            pollReset: async ({ pollId }: { pollId: string }) => {
                return await votingManager.resetPollWithUndo(pollId);
            },
            undoResetPoll: async ({ pollId }: { pollId: string }) => {
                return await votingManager.undoReset(pollId);
            },
            updatePollTitle: async ({ oldPollId, newPollId, displayTitle }: {
                oldPollId: string,
                newPollId: string,
                displayTitle?: string
            }) => {
                // If no displayTitle provided, derive it from newPollId
                const actualDisplayTitle = displayTitle || newPollId.replace('poll_', '').replace(/_/g, ' ');
                return await votingManager.updatePollTitle(oldPollId, newPollId, actualDisplayTitle);
            },
            updateRemovedOptionsPollId: async ({ oldPollId, newPollId }: { oldPollId: string, newPollId: string }) => {
                return await votingManager.updateRemovedOptionsPollId(oldPollId, newPollId);
            }
        };
        // Register all handlers
        Object.entries(pollEventHandlers).forEach(([event, handler]) => {
            frontendCommunicator.onAsync(event, async (...args: any[]) => {
                try {
                    const result = await handler(args[0]);
                    return result;
                } catch (error) {
                    logger.error(`${event} error:`, error);
                    return event === 'getActivePolls' ? [] : null;
                }
            });
        });


        // Register voting system events
        modules.eventManager.registerEventSource(VotingSystemEventSource);

        // Register voting system effects
        modules.effectManager.registerEffect(votingSystemEffectType());
        modules.effectManager.registerEffect(votingSystemUpdateEffectType());
        modules.effectManager.registerEffect(votingSystemBackupEffectType());

        //Register voting system variables
        Object.values(pollVariables).forEach(variable => {
            replaceVariableManager.registerReplaceVariable(variable);
        });

    },
};

export default script;