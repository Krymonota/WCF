{hascontent}
	<table class="table">
		<thead>
			<tr>
				<th colspan="2" class="columnTitle">{lang}wcf.acp.package.name{/lang}</th>
				<th class="columnText">{lang}wcf.acp.package.author{/lang}</a></th>
				<th class="columnText">{lang}wcf.acp.package.license{/lang}</th>
				<th class="columnDate">{lang}wcf.acp.package.packageDate{/lang}</a></th>
				
				{event name='headColumns'}
			</tr>
		</thead>
		
		<tbody>
			{content}
				{foreach from=$packageUpdates item=$package}
					<tr class="jsPackageRow">
						<td class="columnIcon">
							<a href="#" class="jsInstallPackage" data-confirm-message="{lang __encode=true}wcf.acp.package.install.confirmMessage{/lang}" data-package="{$package->package}" data-package-version="{$package->getAccessibleVersion()->packageVersion}"><span class="icon icon16 fa-plus jsTooltip" title="{lang}wcf.acp.package.button.installPackage{/lang}"></span></a>
							
							{event name='buttons'}
						</td>
						<td class="columnTitle" title="{$package->packageDescription}">
							<div class="packageSearchName">{$package->packageName} <span class="packageSearchVersion">{$package->getAccessibleVersion()->packageVersion}</span></div>
							<span class="packageSearchPackage">{$package->package}</span>
						</td>
						<td class="columnText">{if $package->authorURL}<a href="{$package->authorURL}" class="externalURL">{$package->author}</a>{else}{$package->author}{/if}</td>
						<td class="columnText">{if $package->getAccessibleVersion()->licenseURL}<a href="{$package->getAccessibleVersion()->licenseURL}" class="externalURL">{$package->getAccessibleVersion()->license}</a>{else}{$package->getAccessibleVersion()->license}{/if}</td>
						<td class="columnDate">{@$package->getAccessibleVersion()->packageDate|time}</td>
						
						{event name='columns'}
					</tr>
				{/foreach}
			{/content}
		</tbody>
	</table>
{hascontentelse}
	<p class="info">{lang}wcf.acp.package.search.error.noMatches{/lang}</p>
{/hascontent}
