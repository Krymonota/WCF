<div class="box96">
	{@$__wcf->getUserProfileHandler()->getAvatar()->getImageTag(96)}
	
	<div>
		<div class="containerHeadline">
			<h3>
				{event name='beforeUsername'}
				{user object=$__wcf->getUserProfileHandler()->getUserProfile()}
			</h3>
			{if MODULE_USER_RANK}
				{if $__wcf->getUserProfileHandler()->getUserTitle()}
					<p><span class="badge userTitleBadge{if $__wcf->getUserProfileHandler()->getRank() && $__wcf->getUserProfileHandler()->getRank()->cssClassName} {@$__wcf->getUserProfileHandler()->getRank()->cssClassName}{/if}">{$__wcf->getUserProfileHandler()->getUserTitle()}</span></p>
				{/if}
				{if $__wcf->getUserProfileHandler()->getRank() && $__wcf->getUserProfileHandler()->getRank()->rankImage}
					<p><span class="userRankImage">{@$__wcf->getUserProfileHandler()->getRank()->getImage()}</span></p>
				{/if}
			{/if}
		</div>
		
		<dl class="plain dataList containerContent small">
			{include file='userInformationStatistics' user=$__wcf->getUserProfileHandler()->getUserProfile()}
		</dl>
	</div>
</div>
