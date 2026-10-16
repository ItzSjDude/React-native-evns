import React, {useCallback} from 'react';
import {useNavigation, useRoute} from '@react-navigation/native';
import MyTicketsView from './MyTicketsView';

export type MyTicketsParams = {eventId?: string; ticketId?: string} | undefined;

type TicketsNavigation = {canGoBack: () => boolean; goBack: () => void; navigate: (name: string) => void; setParams: (params: {ticketId?: string}) => void};

/** Root-stack route `MyTickets`. Params: `{eventId?, ticketId?}`; a `ticketId` opens that ticket's detail first. */
export default function MyTicketsScreen() {
  const navigation = useNavigation<TicketsNavigation>();
  const params = useRoute().params as MyTicketsParams;
  const onBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate('Tabs');
  }, [navigation]);
  const onExitTicket = useCallback(() => navigation.setParams({ticketId: undefined}), [navigation]);
  return <MyTicketsView onBack={onBack} eventId={params?.eventId} ticketId={params?.ticketId} onExitTicket={onExitTicket} />;
}
