import { ReplaceVariable } from "@crowbartools/firebot-custom-scripts-types/types/modules/replace-variable-manager";
import { votingManager } from "../utility/voting-manager";


function normalizePollId(pollId: string): string {
    return pollId.startsWith('poll_') ? pollId : `poll_${pollId}`;
}

export const pollWinnersVariable: ReplaceVariable = {
    definition: {
        handle: "pollWinners",
        description: "Gets poll winners with individually configurable output format",
        usage: "pollWinners[pollId, displays?]",
        examples: [
            {
                usage: "pollWinners[poll_bestgame]",
                description: "Shows everything (default: names, votes, percent, number)"
            },
            {
                usage: "pollWinners[poll_bestgame, raw]",
                description: "Returns raw array of winning options"
            },
            {
                usage: "pollWinners[poll_bestgame, votes, percent]",
                description: "Shows votes and percentages (e.g. '100 votes, 45%')"
            },
            {
                usage: "pollWinners[poll_bestgame, names, number]",
                description: "Shows names with option numbers (e.g. '1: Game A')"
            },
            {
                usage: "pollWinners[poll_bestgame, names, votes]",
                description: "Shows names and votes only (e.g. 'Game A, 100 votes')"
            },
            {
                usage: "pollWinners[poll_bestgame, names]",
                description: "Shows only names (e.g. 'Game A')"
            },
            {
                usage: "pollWinners[poll_bestgame, votes]",
                description: "Shows only votes (e.g. '100')"
            },
            {
                usage: "pollWinners[poll_bestgame, percent]",
                description: "Shows only percentages (e.g. '45%')"
            },
            {
                usage: "pollWinners[poll_bestgame, number]",
                description: "Shows only option numbers (e.g. '1')"
            }
        ],
        possibleDataOutput: ["array", "text"]
    },
    evaluator: async (_, pollId: string, ...params: string[]) => {
        const poll = await votingManager.getPoll(normalizePollId(pollId));
        if (!poll) return [];

        // Check if raw format requested
        if (params.some(param => param?.toLowerCase() === "raw")) {
            const maxVotes = Math.max(...poll.pollData.options.map(opt => opt.votes));
            return poll.pollData.options.filter(opt => opt.votes === maxVotes);
        }

        // Set display options
        const displayOpts = new Set(
            params
                .map(opt => opt.toLowerCase())
                .filter(Boolean)
        );

        // Default to showing everything if no options specified
        if (displayOpts.size === 0) {
            displayOpts.add("names");
            displayOpts.add("votes");
            displayOpts.add("percent");
            displayOpts.add("number");
        }

        const maxVotes = Math.max(...poll.pollData.options.map(opt => opt.votes));
        const winners = poll.pollData.options.filter(opt => opt.votes === maxVotes);

        const formatOption = (winner: any) => {
            const parts = [];

            if (displayOpts.has("number")) {
                if (displayOpts.size === 1) {
                    return `${winner.option_number}`;
                }
                parts.push(`${winner.option_number}`);
            }

            if (displayOpts.has("names")) {
                parts.push(`${winner.option_name}`);
            }

            if (displayOpts.has("votes")) {
                if (displayOpts.size === 1) {
                    parts.push(winner.votes.toString());
                } else {
                    parts.push(`${winner.votes} votes`);
                }
            }

            if (displayOpts.has("percent") && poll.pollData.total_votes > 0) {
                const percentage = Math.round((winner.votes / poll.pollData.total_votes) * 100);
                parts.push(`${percentage}%`);
            }

            return displayOpts.has("number") && parts.length > 1
                ? `${parts[0]} - ${parts.slice(1).join(", ")}`
                : parts.join(", ");
        };

        const formattedWinners = winners.map(formatOption);

        if (winners.length > 1) {
            return displayOpts.has("names")
                ? `Tie between: ${formattedWinners.slice(0, -1).join(", ")}${formattedWinners.length > 2 ? "," : ""} and ${formattedWinners.slice(-1)}`
                : `${formattedWinners.join(" and ")}`;
        }

        return formattedWinners[0];
    }
};

export const pollStatsVariable: ReplaceVariable = {
    definition: {
        handle: "pollStats",
        description: "Gets vote statistics for entire poll or specific options with configurable output",
        usage: "pollStats[pollId, displays?, optionNumber?]",
        examples: [
            // Full poll statistics
            {
                usage: "pollStats[poll_bestgame]",
                description: "Shows everything (default) - names, votes, percentages and total"
            },
            {
                usage: "pollStats[poll_bestgame, names, votes]",
                description: "Shows just names and vote counts (e.g. \"Game A\": 100 | \"Game B\": 80)"
            },
            {
                usage: "pollStats[poll_bestgame, percent]",
                description: "Shows just percentages (e.g. 45% | 36%)"
            },
            {
                usage: "pollStats[poll_bestgame, votes, total]",
                description: "Shows vote counts and total (e.g. 100 | 80 (Total: 220))"
            },
            {
                usage: "pollStats[poll_bestgame, names, percent]",
                description: "Shows names and percentages (e.g. \"Game A\": 45% | \"Game B\": 36%)"
            },
            {
                usage: "pollStats[poll_bestgame, names, votes, percent]",
                description: "Shows names, votes and percentages (e.g. \"Game A\": 100 (45%) | \"Game B\": 80 (36%))"
            },
            // Single option statistics
            {
                usage: "pollStats[poll_bestgame, names, votes, 1]",
                description: "Shows name and votes for option 1 (e.g. \"Game A\": 100)"
            },
            {
                usage: "pollStats[poll_bestgame, votes, 1]",
                description: "Shows just votes for option 1 (e.g. 100)"
            },
            // Total only
            {
                usage: "pollStats[poll_bestgame, total]",
                description: "Shows just the total vote count (e.g. 220)"
            },
            // Raw data
            {
                usage: "pollStats[poll_bestgame, raw]",
                description: "Returns raw array of all options with their data"
            }
        ],
        possibleDataOutput: ["array", "text", "number"]
    },
    evaluator: async (_, pollId: string, ...params: string[]) => {
        const poll = await votingManager.getPoll(normalizePollId(pollId));
        if (!poll) return [];

        // Split parameters into display options and option number
        const lastParam = params[params.length - 1];
        let optionNumber: string | undefined;
        let displayParams: string[];

        if (/^\d+$/.test(lastParam)) {
            optionNumber = lastParam;
            displayParams = params.slice(0, -1);
        } else {
            displayParams = params;
        }

        // Handle raw format
        if (displayParams[0]?.toLowerCase() === "raw") {
            return poll.pollData.options;
        }

        // Collect all display options into a set
        const displayOpts = new Set(
            displayParams
                .map(opt => opt.toLowerCase())
                .filter(Boolean)
        );

        // If "all" is specified or no options given, show everything
        if (displayOpts.has("all") || displayOpts.size === 0) {
            displayOpts.add("names");
            displayOpts.add("votes");
            displayOpts.add("percent");
            displayOpts.add("total");
        }

        // If only total votes requested
        if (displayOpts.has("total") && displayOpts.size === 1) {
            return poll.pollData.total_votes;
        }

        const formatOption = (option: any) => {
            const parts = [];

            if (displayOpts.has("names")) {
                parts.push(`${option.option_name}`);
            }

            if (displayOpts.has("votes")) {
                const votes = option.votes.toString();
                if (displayOpts.has("names")) {
                    parts.push(`: ${votes}`);
                } else {
                    parts.push(votes);
                }
            }

            if (displayOpts.has("percent")) {
                const percentage = Math.round((option.votes / poll.pollData.total_votes) * 100);
                if (parts.length > 0) {
                    parts.push(`(${percentage}%)`);
                } else {
                    parts.push(`${percentage}%`);
                }
            }

            return parts.join(" ");
        };

        // If specific option requested
        if (optionNumber) {
            const option = poll.pollData.options.find(opt => 
                optionNumber ? opt.option_number === parseInt(optionNumber) : false
            );
            if (!option) return "Option not found";

            const formattedOption = formatOption(option);
            return displayOpts.has("total")
                ? `${formattedOption} (Total Votes: ${poll.pollData.total_votes})`
                : formattedOption;
        }

        // Format all options
        const formattedOptions = poll.pollData.options.map(formatOption);
        const result = formattedOptions.join(" | ");

        return displayOpts.has("total")
            ? `${result} (Total Votes: ${poll.pollData.total_votes})`
            : result;
    }
};

export const pollStatusVariable: ReplaceVariable = {
    definition: {
        handle: "pollStatus",
        description: "Gets current status of a poll from active polls or backups",
        usage: "pollStatus[pollId, mode?]",
        examples: [
            {
                usage: "pollStatus[bestgame]",
                description: "Gets current status of 'Best Game' poll from active/ended polls"
            },
            {
                usage: "pollStatus[bestgame, backups]",
                description: "Gets status of 'Best Game' poll from backups"
            }
        ],
        possibleDataOutput: ["text"]
    },
    evaluator: async (_, pollId: string, mode?: string) => {
        if (mode?.toLowerCase() === "backups") {
            const backupPolls = await votingManager.getBackupPolls();
            const matchingBackup = backupPolls.find(backup =>
                backup.id === pollId ||
                `poll_${backup.pollData.title.replace(/[^a-zA-Z0-9]/g, '_')}` === normalizePollId(pollId)
            );
            if (!matchingBackup) return "not_found";
            return "backed_up";
        }

        const poll = await votingManager.getPoll(normalizePollId(pollId));
        if (!poll) return "not_found";
        if (poll.ended) return "ended";
        if (poll.paused) return "paused";
        return "active";
    }
};

export const pollNameVariable: ReplaceVariable = {
    definition: {
        handle: "pollName",
        description: "Gets the original title of the poll (emojis hidden by default)",
        usage: "pollName[pollId, mode?, emoji?]",
        examples: [
            {
                usage: "pollName[poll_bestgame]",
                description: "Gets name from active/ended polls only, without emojis"
            },
            {
                usage: "pollName[poll_bestgame, emoji]",
                description: "Gets name from active/ended polls only with emojis"
            },
            {
                usage: "pollName[poll_bestgame, backups]",
                description: "Gets name from backup polls only, without emojis"
            },
            {
                usage: "pollName[poll_bestgame, backups, emoji]",
                description: "Gets name from backup polls with emojis"
            }
        ],
        possibleDataOutput: ["text"]
    },
    evaluator: async (_, pollId: string, ...params: string[]) => {
        const normalizedId = normalizePollId(pollId);
        let pollTitle: string;

        // Check parameters in a position-independent way
        const showEmoji = params.some(param => param?.toLowerCase() === "emoji");
        const useBackups = params.some(param => param?.toLowerCase() === "backups");

        if (useBackups) {
            const backupPolls = await votingManager.getBackupPolls();
            const matchingBackup = backupPolls.find(backup =>
                `poll_${backup.pollData.title.replace(/[^a-zA-Z0-9]/g, '_')}` === normalizedId
            );
            pollTitle = matchingBackup?.pollData.title || normalizedId.replace('poll_', '');
        } else {
            const poll = await votingManager.getPoll(normalizedId);
            pollTitle = poll?.pollData.title || normalizedId.replace('poll_', '');
        }

        // Show emojis if emoji flag is present
        if (showEmoji) {
            return pollTitle;
        }

        // Default behavior: remove emojis
        return pollTitle.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
    }
};

export const pollTimeVariable: ReplaceVariable = {
    definition: {
        handle: "pollTime",
        description: "Gets poll end time, remaining time, or duration in various formats",
        usage: "pollTime[pollId, formats?]",
        examples: [
            {
                usage: "pollTime[poll_bestgame]",
                description: "Shows both end time and remaining (e.g. 'Ends at 8:30 PM (5 minutes 30 seconds remaining)')"
            },
            {
                usage: "pollTime[poll_bestgame, time]",
                description: "Shows end time (e.g. '8:30 PM')"
            },
            {
                usage: "pollTime[poll_bestgame, remaining]",
                description: "Shows remaining time (e.g. '5 minutes 30 seconds')"
            },
            {
                usage: "pollTime[poll_bestgame, seconds]",
                description: "Shows remaining time in seconds (e.g. '330')"
            },
            {
                usage: "pollTime[poll_bestgame, time, remaining]",
                description: "Shows end time and remaining (e.g. '8:30 PM - 5 minutes 30 seconds')"
            },
            {
                usage: "pollTime[poll_bestgame, time, seconds]",
                description: "Shows end time and seconds (e.g. '8:30 PM - 330s')"
            },
            {
                usage: "pollTime[poll_bestgame, duration]",
                description: "Shows how long poll has run in seconds"
            }
        ],
        possibleDataOutput: ["text", "number"]
    },
    evaluator: async (_, pollId: string, ...formats: string[]) => {
        const poll = await votingManager.getPoll(normalizePollId(pollId));
        if (!poll?.createdAt) return "No poll data found";

        // Default to showing time and remaining if no formats specified
        if (formats.length === 0) {
            formats = ["time", "remaining"];
        }

        const displayOpts = new Set(formats.map(f => f.toLowerCase()));

        // If ran format requested, return duration
        if (displayOpts.has("duration")) {
            const endTime = poll.closeTime ? new Date(poll.closeTime) : new Date();
            return Math.floor((endTime.getTime() - new Date(poll.createdAt).getTime()) / 1000);
        }

        // Handle end time formats
        if (!poll.closeTime) return "No end time set";

        const endTime = new Date(poll.closeTime);
        const remaining = endTime.getTime() - Date.now();
        const remainingSeconds = Math.max(0, Math.floor(remaining / 1000));

        const parts = [];

        if (displayOpts.has("time")) {
            const timeString = endTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit'
            });
            parts.push(timeString);
        }

        if (displayOpts.has("remaining") && remaining > 0) {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            parts.push(`${minutes} minutes ${seconds} seconds`);
        }

        if (displayOpts.has("seconds")) {
            parts.push(`${remainingSeconds}s`);
        }

        if (remaining <= 0) {
            return "Poll has ended";
        }

        return parts.join(" - ");
    }
};

export const findPollIdVariable: ReplaceVariable = {
    definition: {
        handle: "findPollId",
        description: "Finds a poll ID by searching with keywords across different poll states",
        usage: "findPollId[searchTerm, mode?]",
        examples: [
            {
                usage: "findPollId[game]",
                description: "Searches all polls (default)"
            },
            {
                usage: "findPollId[game, active]",
                description: "Searches only active polls"
            },
            {
                usage: "findPollId[game, ended]",
                description: "Searches only ended polls"
            },
            {
                usage: "findPollId[game, current]",
                description: "Searches both active and ended polls"
            },
            {
                usage: "findPollId[game, backups]",
                description: "Searches only backup polls"
            }
        ],
        possibleDataOutput: ["text"]
    },
    evaluator: async (_, searchTerm: string, mode: string = "all") => {
        const searchMode = mode.toLowerCase();
        const searchTerms = searchTerm.toLowerCase().split(' ').filter(term => term.length > 0);

        const activePolls = await votingManager.getActivePolls();
        const backupPolls = await votingManager.getBackupPolls();
        const endedPolls = await votingManager.getEndedPolls();
        const stoppedPolls = await votingManager.getEndedPolls();
        const allCurrentPolls = [...activePolls, ...stoppedPolls];

        let bestMatch: string | null = null;
        let highestMatchScore = 0;
        let mostRecentTimestamp = 0;

        const calculateMatchScore = (title: string): number => {
            const originalTitle = title.toLowerCase();
            let score = searchTerms.filter(term => originalTitle.includes(term)).length * 2;

            const cleanTitle = originalTitle
                .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]/gu, '')
                .replace(/[^a-zA-Z0-9\s]/g, '')
                .trim();

            const cleanSearchTerms = searchTerms.map(term =>
                term.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]/gu, '')
                    .replace(/[^a-zA-Z0-9\s]/g, '')
                    .trim()
            );

            score += cleanSearchTerms.filter(term => cleanTitle.includes(term)).length;
            return score;
        };

        switch (searchMode) {
            case 'active':
                for (const pollId of activePolls) {
                    const poll = await votingManager.getPoll(pollId);
                    if (!poll?.pollData?.title) continue;

                    const matchScore = calculateMatchScore(poll.pollData.title);
                    if (matchScore > highestMatchScore) {
                        highestMatchScore = matchScore;
                        bestMatch = pollId;
                    }
                }
                break;

            case 'ended':
                for (const pollId of endedPolls) {
                    const poll = await votingManager.getPoll(pollId);
                    if (!poll?.pollData?.title) continue;

                    const matchScore = calculateMatchScore(poll.pollData.title);
                    if (matchScore > highestMatchScore) {
                        highestMatchScore = matchScore;
                        bestMatch = pollId;
                    }
                }
                break;

            case 'current':
                for (const pollId of allCurrentPolls) {
                    const poll = await votingManager.getPoll(pollId);
                    if (!poll?.pollData?.title) continue;

                    const matchScore = calculateMatchScore(poll.pollData.title);
                    if (matchScore > highestMatchScore) {
                        highestMatchScore = matchScore;
                        bestMatch = pollId;
                    }
                }
                break;

            case 'backups':
                for (const backup of backupPolls) {
                    if (!backup?.pollData?.title) continue;

                    const matchScore = calculateMatchScore(backup.pollData.title);
                    const timestamp = new Date(backup.removedAt).getTime();

                    if (matchScore > highestMatchScore ||
                        (matchScore === highestMatchScore && timestamp > mostRecentTimestamp)) {
                        highestMatchScore = matchScore;
                        mostRecentTimestamp = timestamp;
                        bestMatch = `poll_${backup.pollData.title.replace(/[^a-zA-Z0-9]/g, '_')}::backup::${timestamp}`;
                    }
                }
                break;

            case 'all':
            default:
                // First check active polls
                for (const pollId of activePolls) {
                    const poll = await votingManager.getPoll(pollId);
                    if (!poll?.pollData?.title) continue;

                    const matchScore = calculateMatchScore(poll.pollData.title);
                    if (matchScore > highestMatchScore) {
                        highestMatchScore = matchScore;
                        bestMatch = pollId;
                    }
                }

                // If no match found, check ended polls
                if (!bestMatch) {
                    for (const pollId of endedPolls) {
                        const poll = await votingManager.getPoll(pollId);
                        if (!poll?.pollData?.title) continue;

                        const matchScore = calculateMatchScore(poll.pollData.title);
                        if (matchScore > highestMatchScore) {
                            highestMatchScore = matchScore;
                            bestMatch = pollId;
                        }
                    }
                }

                // Finally check backups if still no match
                if (!bestMatch) {
                    for (const backup of backupPolls) {
                        if (!backup?.pollData?.title) continue;

                        const matchScore = calculateMatchScore(backup.pollData.title);
                        const timestamp = new Date(backup.removedAt).getTime();

                        if (matchScore > highestMatchScore ||
                            (matchScore === highestMatchScore && timestamp > mostRecentTimestamp)) {
                            highestMatchScore = matchScore;
                            mostRecentTimestamp = timestamp;
                            bestMatch = `poll_${backup.pollData.title.replace(/[^a-zA-Z0-9]/g, '_')}::backup::${timestamp}`;
                        }
                    }
                }
                break;


        }

        return bestMatch || "No matching poll found";
    }


};

export const pollStopMethodVariable: ReplaceVariable = {
    definition: {
        handle: "pollStopMethod",
        description: "Gets how the poll was stopped (manual/automatic/not stopped)",
        usage: "pollStopMethod[pollId]",
        possibleDataOutput: ["text"]
    },
    evaluator: async (_, pollId: string) => {
        const poll = await votingManager.getPoll(normalizePollId(pollId));
        if (!poll?.ended) return "not_stopped";
        return poll.closeTime ? "automatic" : "manual";
    }
};

export const pollOptionsVariable: ReplaceVariable = {
    definition: {
        handle: "pollOptions",
        description: "Gets formatted list of current or removed poll options with configurable display elements",
        usage: "pollOptions[pollId, displays?, optionNumber?]",
        examples: [
            {
                usage: "pollOptions[poll_punishments]",
                description: "Gets all current options with full formatting (emoji, names, and vote commands)"
            },
            {
                usage: "pollOptions[poll_punishments, emoji, command]",
                description: "Gets current options with just emojis and vote commands"
            },
            {
                usage: "pollOptions[poll_punishments, names]",
                description: "Gets just current option names"
            },
            {
                usage: "pollOptions[poll_punishments, command]",
                description: "Gets just vote commands"
            },
            {
                usage: "pollOptions[poll_punishments, removed]",
                description: "Gets all removed options with full formatting"
            },
            {
                usage: "pollOptions[poll_punishments, removed, names]",
                description: "Gets just removed option names"
            },
            {
                usage: "pollOptions[poll_punishments, emoji, command, names, 1]",
                description: "Gets option 1 with full formatting"
            }
        ],
        possibleDataOutput: ["text"]
    },
    evaluator: async (_, pollId: string, ...params: string[]) => {
        const poll = await votingManager.getPoll(normalizePollId(pollId));
        if (!poll) return "";

        // Handle option number if present
        const lastParam = params[params.length - 1];
        let optionNumber: string | undefined;
        let displayParams: string[];

        if (/^\d+$/.test(lastParam)) {
            optionNumber = lastParam;
            displayParams = params.slice(0, -1);
        } else {
            displayParams = params;
        }

        // Set display options
        const displayOpts = new Set(
            displayParams
                .map(opt => opt.toLowerCase())
                .filter(Boolean)
        );

        // Check if we should show removed options
        const showRemoved = displayOpts.has("removed");
        displayOpts.delete("removed"); // Remove from display options after checking

        // Default to showing everything if no options specified
        if (displayOpts.size === 0) {
            displayOpts.add("emoji");
            displayOpts.add("command");
            displayOpts.add("names");
        }

        if (showRemoved) {
            return await votingManager.getRemovedOptionsFormatted(normalizePollId(pollId));
        }

        const formatOption = (opt: any) => {
            const emojiMatch = opt.option_name.match(/^([\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}])/u);
            const emoji = emojiMatch ? emojiMatch[0] : '';
            const textWithoutEmoji = opt.option_name.replace(/^([\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}])/u, '').trim();

            const parts = [];
            if (displayOpts.has("emoji") && emoji) parts.push(emoji);

            let voteAndName = [];
            if (displayOpts.has("command")) voteAndName.push(`${poll.pollData.votingCommand} ${opt.option_number}`);
            if (displayOpts.has("names")) voteAndName.push(textWithoutEmoji);

            if (voteAndName.length > 0) {
                parts.push(voteAndName.join(' - '));
            }

            return parts.join(' ');
        };

        // If specific option requested
        if (optionNumber) {
            const option = poll.pollData.options.find(opt => 
                optionNumber ? opt.option_number === parseInt(optionNumber) : false
            );
            return option ? formatOption(option) : "";
        }

        // Return all options formatted
        return poll.pollData.options.map(formatOption).join(", ");
    }
};

export const pollUserVotesVariable: ReplaceVariable = {
    definition: {
        handle: "pollUserVotes",
        description: "Gets whether a user has voted in a poll, or their vote count for a specific option",
        usage: "pollUserVotes[pollId, username, optionNumber?]",
        examples: [
            {
                usage: "pollUserVotes[poll_bestgame, MorningStarGG]",
                description: "Checks if MorningStarGG has voted in the poll at all (returns true/false)"
            },
            {
                usage: "pollUserVotes[poll_bestgame, MorningStarGG, 1]",
                description: "Gets how many times MorningStarGG voted for option 1"
            }
        ],
        possibleDataOutput: ["bool", "number"]
    },
    evaluator: async (_, pollId: string, username: string, optionNumber?: string) => {
        const poll = await votingManager.getPoll(normalizePollId(pollId));
        if (!poll?.voters) return optionNumber ? 0 : false;

        // Find username case-insensitively
        const actualUsername = Object.keys(poll.voters).find(
            voter => voter.toLowerCase() === username.toLowerCase()
        );

        if (!actualUsername) return optionNumber ? 0 : false;

        // If option specified, return vote count for that option
        if (optionNumber) {
            const optionNum = parseInt(optionNumber);
            return poll.voters[actualUsername][optionNum] || 0;
        }

        // Otherwise return whether they voted at all
        return true;
    }
};