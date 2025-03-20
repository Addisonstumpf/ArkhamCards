import React, { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { find, last } from 'lodash';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { useDispatch } from 'react-redux';
import { Navigation } from 'react-native-navigation';
import { t } from 'ttag';

import DeckUpgradeComponent, { DeckUpgradeHandles } from './DeckUpgradeComponent';
import { CampaignId, Deck, DeckId, getDeckId, Slots, Trauma } from '@actions/types';
import { NavigationProps } from '@components/nav/types';
import { showDeckModal } from '@components/nav/helper';
import StoryCardSelectorComponent from '@components/campaign/StoryCardSelectorComponent';
import { updateCampaignInvestigatorTrauma } from '@components/campaign/actions';
import EditTraumaComponent from '@components/campaign/EditTraumaComponent';
import space from '@styles/space';
import StyleContext from '@styles/StyleContext';
import { useCampaign, useCampaignDeck } from '@data/hooks';
import { useNavigationButtonPressed, useSlots } from '@components/core/hooks';
import useTraumaDialog from '@components/campaign/useTraumaDialog';
import useDeckUpgradeAction from './useDeckUpgradeAction';
import { useDeckActions } from '@data/remote/decks';
import { useUpdateCampaignActions } from '@data/remote/campaigns';
import { ThunkDispatch } from 'redux-thunk';
import { AppState } from '@reducers';
import { Action } from 'redux';
import useSingleCard from '@components/card/useSingleCard';
import { SimpleDeckEditContextProvider } from './DeckEditContext';
import SingleCampaignT from '@data/interfaces/SingleCampaignT';
import LatestDeckT from '@data/interfaces/LatestDeckT';
import { CampaignInvestigator } from '@data/scenario/GuidedCampaignLog';

export interface UpgradeDeckProps {
  id: DeckId;
  campaignId?: CampaignId;
  showNewDeck: boolean;
}

const EMPTY_TRAUMA = {};

function useCampaignInvestigatorForCampaign(campaign: SingleCampaignT | undefined, deck: LatestDeckT | undefined): CampaignInvestigator | undefined {
  const [investigatorCard] = useSingleCard(deck?.deck.meta?.alternate_front ?? deck?.deck.investigator_code, 'player', deck?.deck.taboo_id);
  return useMemo(() => {
    if (!deck || !investigatorCard) {
      return undefined;
    }
    if (!campaign) {
      return {
        code: investigatorCard.code,
        card: investigatorCard,
        alternate_code: investigatorCard.alternate_of_code ? investigatorCard.code : undefined,
      };
    }
    const code = find(campaign?.investigators, i => i === investigatorCard.alternate_of_code || i === investigatorCard.code);
    if (!code) {
      return undefined;
    }
    return {
      code,
      card: investigatorCard,
      alternate_code: investigatorCard.alternate_of_code ? investigatorCard.code : undefined,
    };
  }, [investigatorCard, deck, campaign]);
}

type AsyncDispatch = ThunkDispatch<AppState, unknown, Action>;
function DeckUpgradeDialog({ id, campaignId, showNewDeck, componentId }: UpgradeDeckProps & NavigationProps) {
  const { backgroundStyle, colors, typography } = useContext(StyleContext);
  const actions = useDeckActions();
  const updateCampaignActions = useUpdateCampaignActions();
  const deck = useCampaignDeck(id, campaignId);
  const campaign = useCampaign(campaignId);
  const deckUpgradeComponent = useRef<DeckUpgradeHandles>(null);

  const latestScenario = useMemo(() => campaign && last(campaign.scenarioResults || []), [campaign]);
  const scenarioName = latestScenario ? latestScenario.scenario : undefined;
  const storyEncounterCodes = useMemo(() => latestScenario && latestScenario.scenarioCode ? [latestScenario.scenarioCode] : [], [latestScenario]);

  const [storyCounts, updateStoryCounts] = useSlots({});
  const dispatch: AsyncDispatch = useDispatch();

  const [traumaUpdate, setTraumaUpdate] = useState<Trauma | undefined>();
  const setInvestigatorTrauma = useCallback((investigator: string, trauma: Trauma) => {
    setTraumaUpdate(trauma);
  }, [setTraumaUpdate]);
  const { showTraumaDialog, traumaDialog } = useTraumaDialog(setInvestigatorTrauma);

  const save = useCallback(() => {
    if (deckUpgradeComponent.current) {
      deckUpgradeComponent.current.save();
    }
  }, [deckUpgradeComponent]);

  useNavigationButtonPressed(({ buttonId }) => {
    if (buttonId === 'save') {
      save();
    }
  }, componentId, [save]);

  const investigator = useCampaignInvestigatorForCampaign(campaign, deck);
  const deckUpgradeComplete = useCallback(async(deck: Deck) => {
    if (campaignId && traumaUpdate) {
      return dispatch(updateCampaignInvestigatorTrauma(updateCampaignActions, campaignId, deck.investigator_code, traumaUpdate));
    }
    if (showNewDeck) {
      showDeckModal(getDeckId(deck), deck, campaign?.id, colors, investigator?.card, 'upgrade');
    } else {
      Navigation.pop(componentId);
    }
  }, [showNewDeck, componentId, campaignId, campaign, dispatch, updateCampaignActions, colors, investigator, traumaUpdate]);

  const onStoryCountsChange = useCallback((storyCounts: Slots) => {
    updateStoryCounts({ type: 'sync', slots: storyCounts });
  }, [updateStoryCounts]);

  const campaignSection = useMemo(() => {
    if (!deck || !campaign || !investigator) {
      return null;
    }
    return (
      <>
        { !campaign.guided && (
          <EditTraumaComponent
            investigator={investigator}
            traumaData={traumaUpdate || ((campaign.investigatorData ?? {})[investigator.code]) || EMPTY_TRAUMA}
            showTraumaDialog={showTraumaDialog}
            sectionHeader
          />
        ) }
        <StoryCardSelectorComponent
          componentId={componentId}
          investigator={investigator}
          deck={deck}
          updateStoryCounts={onStoryCountsChange}
          encounterCodes={storyEncounterCodes}
          scenarioName={scenarioName}
        />
      </>
    );
  }, [deck, componentId, campaign, showTraumaDialog, storyEncounterCodes, scenarioName, investigator, traumaUpdate, onStoryCountsChange]);
  const [saving, error, saveDeckUpgrade] = useDeckUpgradeAction(actions, deckUpgradeComplete);
  if (!deck || !investigator) {
    return null;
  }
  const xp = latestScenario ? (latestScenario.xp || 0) : 0;
  return (
    <View style={styles.wrapper}>
      { traumaDialog }
      <SimpleDeckEditContextProvider deckId={id} investigator={deck.investigator}>
        <ScrollView style={[styles.container, backgroundStyle]}>
          <View style={space.paddingM}>
            <Text style={typography.text}>
              { t`Upgrading your deck allows changes and experience to be tracked over the course of a campaign.` }
            </Text>
          </View>
          <DeckUpgradeComponent
            componentId={componentId}
            deck={deck}
            investigator={investigator}
            startingXp={xp}
            storyCounts={storyCounts}
            ignoreStoryCounts={{}}
            campaignSection={campaignSection}
            saveButtonText={t`Save upgrade`}
            ref={deckUpgradeComponent}
            saving={saving}
            error={error}
            saveDeckUpgrade={saveDeckUpgrade}
          />
        </ScrollView>
      </SimpleDeckEditContextProvider>
    </View>
  );
}

DeckUpgradeDialog.options = () => {
  return {
    topBar: {
      tintColor: 'white',
      rightButtons: [{
        text: t`Save`,
        color: 'white',
        id: 'save',
        accessibilityLabel: t`Save`,
      }],
      backButton: {
        title: t`Cancel`,
        color: 'white',
        accessibilityLabel: t`Cancel`,
      },
    },
  };
};

export default DeckUpgradeDialog;

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
    flexDirection: 'column',
  },
});
