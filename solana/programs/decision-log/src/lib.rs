use anchor_lang::prelude::*;

declare_id!("4EuYq58z6bh5AesWeveS1XzJtT3Sn924zqPLCA6ukn1k");

#[program]
pub mod decision_log {
    use super::*;

    pub fn publish_decision(
        ctx: Context<PublishDecision>,
        run_id: [u8; 16],
        asset: String,
        side: Side,
        entry: u64,
        stop_loss: u64,
        take_profit: u64,
        size_pct: u8,
        confidence: u8,
        content_hash: [u8; 32],
        thesis_uri: String,
    ) -> Result<()> {
        require!(asset.len() <= 32, DecisionError::AssetTooLong);
        require!(thesis_uri.len() <= 200, DecisionError::ThesisUriTooLong);
        require!(size_pct <= 100, DecisionError::InvalidSizePct);
        require!(confidence <= 100, DecisionError::InvalidConfidence);

        let decision = &mut ctx.accounts.decision;
        decision.agent = ctx.accounts.agent.key();
        decision.run_id = run_id;
        decision.ts = Clock::get()?.unix_timestamp;
        decision.asset = asset;
        decision.side = side;
        decision.entry = entry;
        decision.stop_loss = stop_loss;
        decision.take_profit = take_profit;
        decision.size_pct = size_pct;
        decision.confidence = confidence;
        decision.content_hash = content_hash;
        decision.thesis_uri = thesis_uri;
        decision.bump = ctx.bumps.decision;

        emit!(DecisionPublished {
            agent: decision.agent,
            run_id,
            asset: decision.asset.clone(),
            side: decision.side,
            ts: decision.ts,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(run_id: [u8; 16])]
pub struct PublishDecision<'info> {
    #[account(
        init,
        payer = agent,
        space = 8 + Decision::INIT_SPACE,
        seeds = [b"decision", agent.key().as_ref(), run_id.as_ref()],
        bump,
    )]
    pub decision: Account<'info, Decision>,

    #[account(mut)]
    pub agent: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Decision {
    pub agent: Pubkey,
    pub run_id: [u8; 16],
    pub ts: i64,
    #[max_len(32)]
    pub asset: String,
    pub side: Side,
    pub entry: u64,
    pub stop_loss: u64,
    pub take_profit: u64,
    pub size_pct: u8,
    pub confidence: u8,
    pub content_hash: [u8; 32],
    #[max_len(200)]
    pub thesis_uri: String,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Side {
    Long,
    Short,
}

#[event]
pub struct DecisionPublished {
    pub agent: Pubkey,
    pub run_id: [u8; 16],
    pub asset: String,
    pub side: Side,
    pub ts: i64,
}

#[error_code]
pub enum DecisionError {
    #[msg("Asset string exceeds 32 characters")]
    AssetTooLong,
    #[msg("Thesis URI exceeds 200 characters")]
    ThesisUriTooLong,
    #[msg("size_pct must be between 0 and 100")]
    InvalidSizePct,
    #[msg("confidence must be between 0 and 100")]
    InvalidConfidence,
}
