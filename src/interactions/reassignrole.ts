import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { ApplicationCommandType, ChatInputCommandInteraction, ContextMenuCommandBuilder, EmbedBuilder, MessageContextMenuCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';

export default class ReassignRole implements BotInteraction {
	constructor(private client: BotClient) {}

	static builders = [
		new SlashCommandBuilder()
			.setName('reassignrole')
			.setDescription('Reassigns the given role IDs to all members with the role IDs.')
			.setDMPermission(false)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
			.addStringOption(option =>
				option
					.setName('ids')
					.setDescription('The role IDs to reassign')
					.setRequired(true)
			)
	];

	async onChatInteraction(interaction: ChatInputCommandInteraction) {
		const roleIds = interaction.options.getString('ids')!.split(',');
		const guild = interaction.guild!;
		// do not use cache
		const roles = await Promise.all(roleIds.map(id => guild.roles.fetch(id)));

		// if any of the roles are null, fail
		if (roles.some(role => role == null)) {
			await interaction.reply('One or more roles do not exist.');
			return;
		}

		const members = await guild.members.fetch();

		// just in case
		await interaction.reply(`Selected roles:\n- \`${roles.map(role => role!.name).join('`\n- `')}\`\n\nIf these aren't correct, you have 30 seconds to kill the bot.`);

		await new Promise(r => setTimeout(r, 30000));

		await interaction.followUp(`Processing ${members.size} member(s)...`);

		let reassignedCount = 0;

		for (const member of members.values()) {
			const memberRoles = member.roles.cache.filter(role => roleIds.includes(role.id));
			if (memberRoles.size === 0) continue;
			await member.roles.remove(memberRoles, `[interaction/reassignrole] Reassigning roles`);
			// @ts-ignore
			await member.roles.add(memberRoles, `[interaction/reassignrole] Reassigning roles`);
			reassignedCount++;
		}

		await interaction.followUp(`Reassigned roles to ${reassignedCount} member(s).`);
	}
}
