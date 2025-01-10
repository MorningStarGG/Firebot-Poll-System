import { EventSource } from "@crowbartools/firebot-custom-scripts-types/types/modules/event-manager";
import { PollStartMetadata } from '../types/types';
import { logger } from "../logger";

// Define event IDs as constants
export const VOTING_SYSTEM_SOURCE_ID = "msgg:voting-system";
export const POLL_START_EVENT = "pollStart";
export const POLL_STOP_EVENT = "pollStop";

export const VotingSystemEventSource: EventSource = {
    id: VOTING_SYSTEM_SOURCE_ID,
    name: "Advanced Poll System",
    events: [
        {
            id: POLL_STOP_EVENT,
            name: "Advanced Poll System Poll Stopped",
            description: "Triggered when a poll is stopped (manually or automatically)",
            cached: false,
            manualMetadata: {
                pollTitle: "Example: Best Game Poll",
                totalVotes: 100,
                pollId: "poll_example",
                stopType: "manual/automatic",
                runTime: "300", // seconds the poll ran for
                options: [
                    { option_name: "Option 1", votes: 50 },
                    { option_name: "Option 2", votes: 30 }
                ]
            }
        },
        {
            id: POLL_START_EVENT,
            name: "Advanced Poll System Poll Started",
            description: "Triggered when a new poll starts",
            cached: false,
            manualMetadata: {
                pollId: "poll_example",
                pollTitle: "Example: Best Game Poll",
                options: ["Option 1", "Option 2", "Option 3"],
                duration: 300
            }
        }
    ]
};

// Helper function to emit poll start event
export const emitPollStart = async (
    eventManager: any,
    pollData: PollStartMetadata
) => {
    await eventManager.triggerEvent(
        VOTING_SYSTEM_SOURCE_ID,
        POLL_START_EVENT,
        pollData
    );
};
// Helper function to emit stop event
export const emitPollStop = async (
    eventManager: any,
    pollData: {
        pollId: string;
        pollTitle: string;
        totalVotes: number;
        stopType: 'manual' | 'automatic';
        options: Array<{ option_name: string; votes: number }>;
        startTime?: string; // ISO string of when poll started
    }
) => {
    try {
        logger.info('Starting poll stop event emission for:', pollData.pollId);

        const runTime = pollData.startTime ?
            Math.floor((Date.now() - new Date(pollData.startTime).getTime()) / 1000) :
            0;

        const eventData = {
            pollTitle: pollData.pollTitle,
            totalVotes: pollData.totalVotes,
            pollId: pollData.pollId,
            stopType: pollData.stopType,
            runTime: runTime,
            options: pollData.options,
            timestamp: Date.now()
        };

        logger.info('Emitting poll stop event with data:', eventData);

        await eventManager.triggerEvent(
            VOTING_SYSTEM_SOURCE_ID,
            POLL_STOP_EVENT,
            eventData,
            {
                isRepeatable: true,
                skipCache: true
            }
        );

        logger.info('Poll stop event emission completed successfully');
        return true;
    } catch (error) {
        logger.error('Error emitting poll stop event:', error);
        throw error;
    }
};